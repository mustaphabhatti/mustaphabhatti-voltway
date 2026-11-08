import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AMENITIES, CONNECTOR_TYPES, CONNECTOR_CURRENT, cheapestStartWindow, dailySchedule, estimateCharging, scoreRecommendations,
  type ConnectorType, type RecommendationCandidate, type VehicleChargingProfile, type PortStatus,
} from '@voltway/shared';
import { q, one } from '../db';
import { requireUser } from '../lib/auth';
import { badRequest, conflict, notFound } from '../lib/errors';
import { parse, zCsv } from '../lib/validate';
import { getRoutes } from '../integrations/maps';
import { geocode } from '../integrations/maps/geocoding';
import { getStation, listStations, occupancyForecast } from '../services/stations';
import { setPortStatus } from '../services/portStatus';

const listQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(1000).optional(),
  bbox: z.string().optional(),
  connectors: zCsv,
  currentTypes: zCsv,
  minPowerKw: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  available: z.coerce.boolean().optional(),
  openNow: z.coerce.boolean().optional(),
  is247: z.coerce.boolean().optional(),
  amenities: zCsv,
  networks: zCsv,
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(80).optional(),
  vehicleId: z.string().uuid().optional(),
  sort: z.enum(['distance', 'power', 'price', 'availability', 'rating', 'reliability']).optional(),
  minScore: z.coerce.number().min(0).max(10).optional(),
  comingSoon: z.coerce.boolean().optional(),
  locationTypes: zCsv,
  limit: z.coerce.number().min(1).max(500).optional(),
});

export async function vehicleProfileFor(userId: string | undefined, vehicleId?: string) {
  if (!userId) return null;
  const v = vehicleId
    ? await one<any>('SELECT * FROM user_vehicles WHERE id = $1 AND user_id = $2', [vehicleId, userId])
    : await one<any>('SELECT * FROM user_vehicles WHERE user_id = $1 ORDER BY is_default DESC, created_at LIMIT 1', [userId]);
  return v;
}

export function toProfile(v: any): VehicleChargingProfile & { efficiencyWhPerKm: number } {
  return {
    batteryKwh: Number(v.battery_kwh), maxAcKw: Number(v.max_ac_kw), maxDcKw: Number(v.max_dc_kw),
    curveProfile: v.curve_profile, efficiencyWhPerKm: Number(v.efficiency_wh_km ?? 170),
  };
}

export async function stationRoutes(app: FastifyInstance) {
  app.get('/stations', async (req) => {
    const qy = parse(listQuery, req.query);
    const near = qy.lat != null && qy.lng != null ? { lat: qy.lat, lng: qy.lng } : null;
    let bbox: [number, number, number, number] | null = null;
    if (qy.bbox) {
      const parts = qy.bbox.split(',').map(Number);
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) throw badRequest('bbox must be west,south,east,north');
      bbox = parts as [number, number, number, number];
    }
    const vehicle = await vehicleProfileFor(req.user?.id, qy.vehicleId);
    const stations = await listStations({
      near, radiusKm: qy.radiusKm, bbox, limit: qy.limit ?? 300,
      vehicleConnectors: vehicle?.connectors,
      filters: {
        connectors: qy.connectors as ConnectorType[], currentTypes: qy.currentTypes as ('AC' | 'DC')[], minPowerKw: qy.minPowerKw,
        maxPricePerKwh: qy.maxPrice, availableOnly: qy.available, openNow: qy.openNow, is24_7: qy.is247,
        amenities: qy.amenities, networks: qy.networks, text: qy.q, city: qy.city,
        minScore: qy.minScore, includeComingSoon: qy.comingSoon, locationTypes: qy.locationTypes,
      },
    });
    const sorters: Record<string, (a: any, b: any) => number> = {
      power: (a, b) => b.maxPowerKw - a.maxPowerKw,
      price: (a, b) => (a.pricing?.currentRate ?? 1e9) - (b.pricing?.currentRate ?? 1e9),
      availability: (a, b) => b.compatibleAvailable - a.compatibleAvailable || (a.distanceKm ?? 0) - (b.distanceKm ?? 0),
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
      reliability: (a, b) => (b.reliability.score ?? -1) - (a.reliability.score ?? -1),
    };
    if (qy.sort && sorters[qy.sort]) stations.sort(sorters[qy.sort]);
    return { stations, count: stations.length, vehicle: vehicle ? { id: vehicle.id, connectors: vehicle.connectors } : null };
  });

  app.get('/stations/meta', async () => {
    const networks = await q<any>(
      `SELECT c.id, c.name, c.slug, c.brand_color, COUNT(s.id)::int AS stations FROM companies c
         JOIN stations s ON s.company_id = c.id AND s.listing_status = 'approved' GROUP BY c.id ORDER BY c.name`,
    );
    const cities = await q<any>(
      `SELECT city, country, COUNT(*)::int AS stations, AVG(ST_Y(location::geometry)) lat, AVG(ST_X(location::geometry)) lng
         FROM stations WHERE listing_status = 'approved' GROUP BY city, country ORDER BY stations DESC`,
    );
    const power = await one<any>(`SELECT MAX(max_power_kw) max FROM ports p JOIN stations s ON s.id = p.station_id WHERE s.listing_status = 'approved'`);
    return { networks, cities, amenities: AMENITIES, connectors: CONNECTOR_TYPES, maxPowerKw: power?.max ?? 350 };
  });

  app.get('/stations/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const qy = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), vehicleId: z.string().uuid().optional() }), req.query);
    const vehicle = await vehicleProfileFor(req.user?.id, qy.vehicleId);
    const station = await getStation(id, { origin: qy.lat != null && qy.lng != null ? { lat: qy.lat, lng: qy.lng } : null, connectors: vehicle?.connectors });
    if (!station) throw notFound('Station not found');
    const canSeeUnapproved = req.user && (req.user.role === 'admin' || req.user.companyIds.includes(station.operator.id));
    if (station.listingStatus !== 'approved' && !canSeeUnapproved) throw notFound('Station not found');
    const favorite = req.user ? !!(await one('SELECT 1 FROM favorites WHERE user_id = $1 AND station_id = $2', [req.user.id, id])) : false;
    const watching = req.user ? !!(await one('SELECT 1 FROM station_watches WHERE user_id = $1 AND station_id = $2 AND expires_at > now()', [req.user.id, id])) : false;
    const activeSessions = await q<any>(
      `SELECT port_id, current_soc, target_soc, started_at FROM charging_sessions WHERE station_id = $1 AND status = 'active'`, [id]);
    return { station, favorite, watching, activeSessions: activeSessions.length };
  });

  app.get('/stations/:id/eta', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const qy = parse(z.object({ lat: z.coerce.number(), lng: z.coerce.number() }), req.query);
    const s = await one<any>('SELECT ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM stations WHERE id = $1', [id]);
    if (!s) throw notFound();
    const [r] = await getRoutes({ from: { lat: qy.lat, lng: qy.lng }, to: { lat: s.lat, lng: s.lng } });
    return {
      provider: r.provider, approximate: r.approximate, distanceKm: r.distanceKm, durationMin: r.durationMin,
      baseDurationMin: r.baseDurationMin, traffic: r.traffic, geometry: r.geometry, steps: r.steps, arriveAt: new Date(Date.now() + r.durationMin * 60_000).toISOString(),
    };
  });

  app.get('/stations/:id/pricing', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const s = await one<any>('SELECT s.timezone, t.config FROM stations s LEFT JOIN tariffs t ON t.id = s.tariff_id WHERE s.id = $1', [id]);
    if (!s) throw notFound();
    if (!s.config) return { schedule: [], tariff: null };
    const start = new Date();
    start.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
    return { schedule: dailySchedule(s.config, start, s.timezone), tariff: s.config, timezone: s.timezone };
  });

  app.get('/stations/:id/forecast', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const s = await one<any>('SELECT timezone FROM stations WHERE id = $1', [id]);
    if (!s) throw notFound();
    return occupancyForecast(id, s.timezone);
  });

  // ── Reviews ────────────────────────────────────────────────────────────────
  app.get('/stations/:id/reviews', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const reviews = await q<any>(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.operator_reply, r.operator_replied_at, u.full_name AS author, r.user_id
         FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.station_id = $1 AND r.status = 'visible' ORDER BY r.created_at DESC LIMIT 100`,
      [id],
    );
    const dist = await q<any>(`SELECT rating, COUNT(*)::int n FROM reviews WHERE station_id = $1 AND status = 'visible' GROUP BY rating`, [id]);
    return { reviews: reviews.map((r) => ({ ...r, author: r.author.split(' ')[0] + (r.author.split(' ')[1] ? ` ${r.author.split(' ')[1][0]}.` : '') })), distribution: dist };
  });

  app.post('/stations/:id/reviews', async (req) => {
    const u = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1500).default('') }), req.body);
    if (!(await one(`SELECT 1 FROM stations WHERE id = $1 AND listing_status = 'approved'`, [id]))) throw notFound();
    const r = await one<any>(
      `INSERT INTO reviews(station_id, user_id, rating, comment) VALUES ($1,$2,$3,$4)
       ON CONFLICT (station_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now(), status = 'visible'
       RETURNING *`,
      [id, u.id, b.rating, b.comment],
    );
    return { review: r };
  });

  app.post('/reviews/:id/report', async (req) => {
    const u = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    await q('INSERT INTO review_reports(review_id, user_id, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, u.id, b.reason]);
    const n = await one<any>('SELECT COUNT(*)::int n FROM review_reports WHERE review_id = $1 AND NOT resolved', [id]);
    if (n.n >= 3) await q(`UPDATE reviews SET status = 'flagged' WHERE id = $1 AND status = 'visible'`, [id]);
    return { ok: true };
  });

  // Driver-reported station problems
  app.post('/stations/:id/reports', async (req) => {
    const u = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(
      z.object({
        kind: z.enum(['status', 'wrong_info', 'closed', 'price', 'other']),
        portId: z.string().uuid().optional(),
        reportedStatus: z.enum(['available', 'occupied', 'out_of_service', 'no_power']).optional(),
        message: z.string().trim().max(1000).default(''),
      }),
      req.body,
    );
    const st = await one<any>('SELECT integration_type FROM stations WHERE id = $1', [id]);
    if (!st) throw notFound();
    await q('INSERT INTO station_reports(station_id, port_id, user_id, kind, reported_status, message) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, b.portId ?? null, u.id, b.kind, b.reportedStatus ?? null, b.message]);
    // Driver reports only update the displayed status where no live feed exists — and are labelled as driver reports.
    let applied = false;
    if (b.kind === 'status' && b.portId && b.reportedStatus && st.integration_type === 'none') {
      await setPortStatus(b.portId, b.reportedStatus as PortStatus, 'user_reported');
      applied = true;
    }
    return { ok: true, applied };
  });

  app.post('/stations/:id/watch', async (req) => {
    const u = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ connectorTypes: z.array(z.enum(CONNECTOR_TYPES)).default([]), hours: z.number().min(0.25).max(12).default(2) }), req.body ?? {});
    await q(
      `INSERT INTO station_watches(user_id, station_id, connector_types, expires_at) VALUES ($1,$2,$3, now() + make_interval(mins => $4))
       ON CONFLICT (user_id, station_id) DO UPDATE SET connector_types = EXCLUDED.connector_types, expires_at = EXCLUDED.expires_at`,
      [u.id, id, b.connectorTypes, Math.round(b.hours * 60)],
    );
    return { ok: true };
  });
  app.delete('/stations/:id/watch', async (req) => {
    const u = requireUser(req);
    await q('DELETE FROM station_watches WHERE user_id = $1 AND station_id = $2', [u.id, (req.params as any).id]);
    return { ok: true };
  });

  // ── Estimator ──────────────────────────────────────────────────────────────
  const estimateSchema = z.object({
    vehicleId: z.string().uuid().optional(),
    vehicle: z.object({ batteryKwh: z.number().positive(), maxAcKw: z.number().min(0), maxDcKw: z.number().min(0), curveProfile: z.enum(['standard_400v', 'flat_800v', 'lfp', 'legacy']).optional() }).optional(),
    portId: z.string().uuid().optional(),
    charger: z.object({ powerKw: z.number().positive(), currentType: z.enum(['AC', 'DC']) }).optional(),
    startSoc: z.number().min(0).max(100),
    targetSoc: z.number().min(1).max(100),
    ambientTempC: z.number().min(-40).max(55).nullable().optional(),
    startTime: z.string().datetime().optional(),
    compareWindows: z.boolean().default(true),
  });

  app.post('/estimate', async (req) => {
    const b = parse(estimateSchema, req.body);
    let vehicle = b.vehicle;
    if (!vehicle) {
      const v = await vehicleProfileFor(req.user?.id, b.vehicleId);
      if (!v) throw badRequest('Provide vehicle details or add a vehicle to your profile');
      vehicle = toProfile(v);
    }
    let charger = b.charger;
    let tariff = null;
    let timeZone = 'UTC';
    let availableShare = 1;
    let utilization: number | undefined;
    if (b.portId) {
      const p = await one<any>(
        `SELECT p.max_power_kw, p.current_type, p.power_group, p.station_id, s.timezone, COALESCE(pt.config, t.config) AS tariff
           FROM ports p JOIN stations s ON s.id = p.station_id LEFT JOIN tariffs t ON t.id = s.tariff_id LEFT JOIN tariffs pt ON pt.id = p.tariff_id
          WHERE p.id = $1`,
        [b.portId],
      );
      if (!p) throw notFound('Port not found');
      charger = { powerKw: Number(p.max_power_kw), currentType: p.current_type };
      tariff = p.tariff;
      timeZone = p.timezone;
      if (p.power_group) {
        const busy = await one<any>(
          `SELECT COUNT(*)::int n FROM ports WHERE station_id = $1 AND power_group = $2 AND id <> $3 AND status IN ('charging','occupied')`,
          [p.station_id, p.power_group, b.portId],
        );
        if (busy.n > 0) availableShare = 1 / (busy.n + 1);
      }
      const u = await one<any>(`SELECT AVG(CASE WHEN status IN ('charging','occupied') THEN 1 ELSE 0 END)::float u FROM ports WHERE station_id = $1 AND is_active`, [p.station_id]);
      utilization = u?.u ?? undefined;
    }
    if (!charger) throw badRequest('Choose a charging port or charger power');
    const input = {
      vehicle, charger: { ...charger, availableShare }, startSoc: b.startSoc, targetSoc: b.targetSoc,
      ambientTempC: b.ambientTempC ?? null, startTime: b.startTime ? new Date(b.startTime) : new Date(), tariff, timeZone, utilization,
    };
    const estimate = estimateCharging(input);
    if (availableShare < 1) estimate.assumptions.push('Power is shared with a busy neighbouring port, so the available power is reduced.');
    const windows = tariff && b.compareWindows ? cheapestStartWindow(input, 24) : null;
    return { estimate, windows: windows ? { now: windows.now, best: windows.best, savings: windows.savings, savingsPercent: windows.savingsPercent } : null };
  });

  // ── Search ─────────────────────────────────────────────────────────────────
  app.get('/search', async (req) => {
    const qy = parse(z.object({ q: z.string().trim().min(2).max(120), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.query);
    return { results: await geocode(qy.q, qy.lat != null && qy.lng != null ? { lat: qy.lat, lng: qy.lng } : undefined) };
  });

  app.get('/vehicle-models', async () => ({
    models: await q('SELECT * FROM vehicle_models ORDER BY brand, model, variant'),
  }));

  // ── Smart recommendations ─────────────────────────────────────────────────
  app.post('/recommendations', async (req) => {
    const b = parse(
      z.object({
        lat: z.number(), lng: z.number(),
        vehicleId: z.string().uuid().optional(),
        startSoc: z.number().min(0).max(100).optional(),
        targetSoc: z.number().min(1).max(100).optional(),
        mode: z.enum(['balanced', 'closest', 'fastest', 'cheapest', 'least_wait', 'route']).default('balanced'),
        radiusKm: z.number().min(1).max(100).default(25),
        ambientTempC: z.number().nullable().optional(),
      }),
      req.body,
    );
    const v = await vehicleProfileFor(req.user?.id, b.vehicleId);
    const profile = v ? toProfile(v) : { batteryKwh: 60, maxAcKw: 7.4, maxDcKw: 100, curveProfile: 'standard_400v' as const, efficiencyWhPerKm: 170 };
    const connectors: ConnectorType[] = v?.connectors ?? ['CCS2', 'Type2'];
    const startSoc = b.startSoc ?? v?.current_soc ?? 30;
    const targetSoc = b.targetSoc ?? v?.target_soc ?? 80;
    if (targetSoc <= startSoc) throw badRequest('Target battery must be above the current level');
    const stations = await listStations({ near: { lat: b.lat, lng: b.lng }, radiusKm: b.radiusKm, vehicleConnectors: connectors, filters: { connectors }, limit: 40 });
    const usable = stations.filter((s) => !['offline', 'no_power', 'maintenance'].includes(s.status.operational) && s.openNow.open !== false);
    const candidates: (RecommendationCandidate & { station: any; estimate: any })[] = [];
    for (const s of usable) {
      const compatible = s.ports.filter((p) => p.compatible && !['out_of_service', 'offline', 'no_power'].includes(p.status));
      if (!compatible.length) continue;
      // Pick the port that would charge fastest for this car.
      let best: { port: (typeof compatible)[number]; est: ReturnType<typeof estimateCharging> } | null = null;
      for (const p of compatible) {
        if ((CONNECTOR_CURRENT[p.connectorType] === 'DC' ? profile.maxDcKw : profile.maxAcKw) <= 0) continue;
        const est = estimateCharging({
          vehicle: profile, charger: { powerKw: p.maxPowerKw, currentType: p.currentType }, startSoc, targetSoc,
          ambientTempC: b.ambientTempC ?? null, startTime: new Date(Date.now() + (s.travel?.travelMinutes ?? 0) * 60_000),
          tariff: s.tariff, timeZone: s.timezone, stepSoc: 1,
        });
        if (!best || est.durationMinutes < best.est.durationMinutes) best = { port: p, est };
      }
      if (!best) continue;
      candidates.push({
        stationId: s.id, name: s.name, distanceKm: s.travel?.distanceKm ?? s.distanceKm ?? 0, travelMinutes: s.travel?.travelMinutes ?? 0,
        compatiblePorts: compatible.length, availableCompatiblePorts: compatible.filter((p) => p.status === 'available').length,
        bestPowerKw: best.port.maxPowerKw, currentType: best.port.currentType, pricePerKwh: s.pricing?.currentRate ?? 0, currency: s.pricing?.currency ?? 'PKR',
        estimatedWaitMinutes: s.estimatedWaitMinutes ?? 0, chargeMinutes: best.est.durationMinutes, chargeCost: best.est.cost?.total ?? 0,
        statusFresh: !s.status.stale && (s.status.source === 'live' || s.status.source === 'simulated' || s.status.source === 'operator_reported'),
        rating: s.rating, trafficLevel: s.travel?.traffic.level as any, station: s,
        estimate: { durationMinutes: best.est.durationMinutes, energyKwh: best.est.energyFromChargerKwh, cost: best.est.cost?.total ?? null, averagePowerKw: best.est.averagePowerKw, completionTime: best.est.completionTime, portLabel: best.port.label },
      });
    }
    const scored = scoreRecommendations(candidates, b.mode).slice(0, 12);
    return {
      mode: b.mode, startSoc, targetSoc,
      vehicle: v ? { id: v.id, name: v.nickname || `${v.brand} ${v.model}` } : null,
      usingDefaultVehicle: !v,
      recommendations: scored.map(({ station, ...r }: any) => ({ ...r, station: { id: station.id, name: station.name, address: station.address, city: station.city, lat: station.lat, lng: station.lng, operator: station.operator, status: station.status, summary: station.summary, travel: station.travel, pricing: station.pricing, isDemo: station.isDemo } })),
      notes: ['Travel times use an estimated traffic pattern unless a live traffic provider is configured.', 'Charging times are estimates based on your vehicle charging curve.'],
    };
  });

  // Convenience for clients that only need to check a port can start remotely.
  app.get('/ports/:id', async (req) => {
    const p = await one<any>('SELECT p.*, s.integration_type, s.name station_name FROM ports p JOIN stations s ON s.id = p.station_id WHERE p.id = $1', [(req.params as any).id]);
    if (!p) throw notFound();
    return { port: p };
  });
}
