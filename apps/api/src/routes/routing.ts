import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CONNECTOR_CURRENT, PLAN_STRATEGIES, normalizeTariff, planRoute, rateAt, summarizePorts,
  type ConnectorType, type LatLng, type PlanStrategy, type RouteCandidate,
} from '@voltway/shared';
import { q } from '../db';
import { badRequest } from '../lib/errors';
import { parse } from '../lib/validate';
import { getRoutes, type RouteResult } from '../integrations/maps';
import { notify } from '../services/notifications';
import { toProfile, vehicleProfileFor } from './stations';

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), label: z.string().max(200).optional() });

function sampleLine(geom: LatLng[], max = 400) {
  if (geom.length <= max) return geom;
  const out: LatLng[] = [];
  const stride = (geom.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(geom[Math.round(i * stride)]);
  return out;
}

async function corridorCandidates(route: RouteResult, connectors: ConnectorType[], corridorKm: number, vehicle: { maxAcKw: number; maxDcKw: number }) {
  const line = sampleLine(route.geometry);
  const wkt = `LINESTRING(${line.map((p) => `${p.lng} ${p.lat}`).join(',')})`;
  const rows = await q<any>(
    `WITH l AS (SELECT ST_GeomFromText($1, 4326) AS g)
     SELECT s.id, s.name, s.timezone, s.maintenance_mode, ST_Y(s.location::geometry) lat, ST_X(s.location::geometry) lng,
            ST_LineLocatePoint(l.g, s.location::geometry) AS frac,
            ST_Distance(s.location, l.g::geography) / 1000 AS off_km,
            t.config AS tariff, c.name AS operator,
            json_agg(json_build_object('id', p.id, 'type', p.connector_type, 'current', p.current_type, 'kw', p.max_power_kw, 'status', p.status)) AS ports
       FROM stations s CROSS JOIN l
       JOIN companies c ON c.id = s.company_id
       JOIN ports p ON p.station_id = s.id AND p.is_active AND p.connector_type = ANY($3)
       LEFT JOIN tariffs t ON t.id = s.tariff_id
      WHERE s.listing_status = 'approved' AND ST_DWithin(s.location, l.g::geography, $2)
      GROUP BY s.id, l.g, t.config, c.name`,
    [wkt, corridorKm * 1000, connectors],
  );
  const now = new Date();
  return rows
    .map((r): (RouteCandidate & { operator: string }) | null => {
      const ports = r.ports as { id: string; type: ConnectorType; current: 'AC' | 'DC'; kw: number; status: string }[];
      const working = ports.filter((p) => !['out_of_service', 'offline', 'no_power'].includes(p.status));
      // best port for this vehicle
      const effective = (p: (typeof ports)[number]) => Math.min(Number(p.kw), CONNECTOR_CURRENT[p.type] === 'DC' ? vehicle.maxDcKw : vehicle.maxAcKw);
      const best = working.sort((a, b) => effective(b) - effective(a))[0];
      if (!best) return null;
      const tariff = normalizeTariff(r.tariff);
      const summary = summarizePorts(ports as any, r.maintenance_mode);
      return {
        stationId: r.id, portId: best.id, name: r.name, operator: r.operator, lat: r.lat, lng: r.lng,
        alongKm: r.frac * route.distanceKm, detourKm: r.off_km * 1.3 + 0.3,
        powerKw: Number(best.kw), currentType: best.current,
        pricePerKwh: r.tariff ? rateAt(tariff, now, r.timezone).rate : 0, currency: tariff.currency,
        availablePorts: working.filter((p) => p.status === 'available').length, totalPorts: ports.length,
        estimatedWaitMinutes: 25, tariff: r.tariff, timeZone: r.timezone,
        operational: !r.maintenance_mode && !['offline', 'no_power'].includes(summary.operationalStatus),
      };
    })
    .filter((c): c is RouteCandidate & { operator: string } => !!c);
}

export async function routingRoutes(app: FastifyInstance) {
  app.post('/routes/plan', async (req) => {
    const b = parse(
      z.object({
        from: point,
        to: point,
        vehicleId: z.string().uuid().optional(),
        vehicle: z.object({ batteryKwh: z.number().positive(), maxAcKw: z.number(), maxDcKw: z.number(), efficiencyWhPerKm: z.number().min(80).max(400), connectors: z.array(z.string()).min(1), curveProfile: z.enum(['standard_400v', 'flat_800v', 'lfp', 'legacy']).optional() }).optional(),
        startSoc: z.number().min(1).max(100),
        minArrivalSoc: z.number().min(0).max(50).default(15),
        destinationSoc: z.number().min(0).max(100).optional(),
        maxChargeSoc: z.number().min(50).max(100).optional(),
        ambientTempC: z.number().min(-40).max(55).nullable().optional(),
        departAt: z.string().datetime().optional(),
        strategies: z.array(z.enum(['fastest', 'fewest_stops', 'cheapest'])).optional(),
      }),
      req.body,
    );
    let profile, connectors: ConnectorType[], vehicleName: string;
    if (b.vehicle) {
      profile = { ...b.vehicle };
      connectors = b.vehicle.connectors as ConnectorType[];
      vehicleName = 'Custom vehicle';
    } else {
      const v = await vehicleProfileFor(req.user?.id, b.vehicleId);
      if (!v) throw badRequest('Add a vehicle to your profile (or provide vehicle details) to plan an EV route');
      profile = toProfile(v);
      connectors = v.connectors;
      vehicleName = v.nickname || `${v.brand} ${v.model}`;
    }
    const departAt = b.departAt ? new Date(b.departAt) : new Date();
    const routes = await getRoutes({ from: b.from, to: b.to, alternatives: true, departAt });
    const strategies: PlanStrategy[] = b.strategies ?? ['fastest', 'fewest_stops', 'cheapest'];
    const options: any[] = [];
    const seen = new Set<string>();
    for (const [ri, route] of routes.slice(0, 2).entries()) {
      const corridor = route.approximate ? 25 : route.distanceKm > 100 ? 8 : 4;
      const candidates = await corridorCandidates(route, connectors, corridor, profile);
      for (const strategy of ri === 0 ? strategies : (['fastest'] as PlanStrategy[])) {
        const plan = planRoute({
          distanceKm: route.distanceKm, durationMinutes: route.durationMin, vehicle: profile, startSoc: b.startSoc,
          minArrivalSoc: b.minArrivalSoc, destinationSoc: b.destinationSoc, maxChargeSoc: b.maxChargeSoc,
          candidates, strategy, ambientTempC: b.ambientTempC ?? null, departAt,
        });
        // Skip duplicate plans (same stops on the same route)
        const sig = `${ri}:${plan.stops.map((s) => s.candidate.stationId).join('|')}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        options.push({
          id: `${ri}-${strategy}`,
          routeIndex: ri,
          strategy,
          label: ri === 0 ? PLAN_STRATEGIES[strategy].label : 'Alternative route',
          description: ri === 0 ? PLAN_STRATEGIES[strategy].description : route.summary,
          route: {
            provider: route.provider, approximate: route.approximate, distanceKm: route.distanceKm, durationMin: route.durationMin,
            baseDurationMin: route.baseDurationMin, summary: route.summary, traffic: route.traffic, geometry: route.geometry, steps: route.steps,
          },
          plan: {
            ...plan,
            stops: plan.stops.map((s) => ({ ...s, candidate: { ...s.candidate, tariff: undefined } })),
          },
          candidatesOnRoute: candidates.length,
        });
      }
    }
    if (!options.length) throw badRequest('Could not plan a route between these points');
    const best = options[0];
    if (req.user && best.plan.stops.length > 0) {
      await notify(req.user.id, 'low_battery', 'Charging stop needed for your trip',
        `With ${b.startSoc}% battery you'll need ${best.plan.stops.length} stop${best.plan.stops.length > 1 ? 's' : ''} to reach ${b.to.label ?? 'your destination'}. First stop: ${best.plan.stops[0].candidate.name}.`,
        { to: b.to }, `lowbat:${new Date().toISOString().slice(0, 13)}:${b.to.lat.toFixed(2)},${b.to.lng.toFixed(2)}`);
    }
    if (req.user && best.route.traffic.level === 'heavy') {
      await notify(req.user.id, 'traffic', 'Heavy traffic on your route',
        `Expect about ${Math.round(best.route.traffic.delayMin)} extra minutes (${best.route.traffic.source === 'live' ? 'live traffic' : 'typical pattern, estimated'}).`,
        {}, `traffic:${new Date().toISOString().slice(0, 13)}:${b.to.lat.toFixed(2)}`);
    }
    return {
      vehicle: { name: vehicleName, ...profile, connectors },
      from: b.from, to: b.to, startSoc: b.startSoc, minArrivalSoc: b.minArrivalSoc,
      provider: routes[0].provider,
      approximate: routes[0].approximate,
      options,
    };
  });
}
