import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CONNECTOR_TYPES, NOTIFICATION_TYPES } from '@voltway/shared';
import { q, one, tx } from '../db';
import { requireUser } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { listStations } from '../services/stations';
import { getSessionFull, startSession, stopSession, controllerFor, idTagFor } from '../services/sessions';
import { setPortStatus } from '../services/portStatus';
import { notify } from '../services/notifications';

const vehicleSchema = z.object({
  modelId: z.number().int().optional().nullable(),
  nickname: z.string().trim().max(40).default(''),
  brand: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  batteryKwh: z.number().min(5).max(250),
  maxAcKw: z.number().min(0).max(43),
  maxDcKw: z.number().min(0).max(500),
  connectors: z.array(z.enum(CONNECTOR_TYPES)).min(1, 'Select at least one connector'),
  curveProfile: z.enum(['standard_400v', 'flat_800v', 'lfp', 'legacy']).default('standard_400v'),
  efficiencyWhPerKm: z.number().int().min(80).max(400).default(170),
  currentSoc: z.number().int().min(0).max(100).default(50),
  targetSoc: z.number().int().min(1).max(100).default(80),
  isDefault: z.boolean().default(false),
});

export async function driverRoutes(app: FastifyInstance) {
  // ── Vehicles ───────────────────────────────────────────────────────────────
  app.get('/me/vehicles', async (req) => {
    const u = requireUser(req);
    return { vehicles: await q('SELECT * FROM user_vehicles WHERE user_id = $1 ORDER BY is_default DESC, created_at', [u.id]) };
  });

  app.post('/me/vehicles', async (req) => {
    const u = requireUser(req);
    const b = parse(vehicleSchema, req.body);
    const v = await tx(async (c) => {
      const count = await one<any>('SELECT COUNT(*)::int n FROM user_vehicles WHERE user_id = $1', [u.id], c);
      const isDefault = b.isDefault || count.n === 0;
      if (isDefault) await c.query('UPDATE user_vehicles SET is_default = false WHERE user_id = $1', [u.id]);
      return one<any>(
        `INSERT INTO user_vehicles(user_id, model_id, nickname, brand, model, battery_kwh, max_ac_kw, max_dc_kw, connectors, curve_profile,
                                   efficiency_wh_km, current_soc, target_soc, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [u.id, b.modelId ?? null, b.nickname, b.brand, b.model, b.batteryKwh, b.maxAcKw, b.maxDcKw, b.connectors, b.curveProfile,
         b.efficiencyWhPerKm, b.currentSoc, b.targetSoc, isDefault],
        c,
      );
    });
    return { vehicle: v };
  });

  app.patch('/me/vehicles/:id', async (req) => {
    const u = requireUser(req);
    const { id } = req.params as any;
    const b = parse(vehicleSchema.partial(), req.body);
    const existing = await one<any>('SELECT * FROM user_vehicles WHERE id = $1 AND user_id = $2', [id, u.id]);
    if (!existing) throw notFound('Vehicle not found');
    const v = await tx(async (c) => {
      if (b.isDefault) await c.query('UPDATE user_vehicles SET is_default = false WHERE user_id = $1', [u.id]);
      return one<any>(
        `UPDATE user_vehicles SET model_id = $3, nickname = $4, brand = $5, model = $6, battery_kwh = $7, max_ac_kw = $8, max_dc_kw = $9,
                connectors = $10, curve_profile = $11, efficiency_wh_km = $12, current_soc = $13, target_soc = $14, is_default = $15
          WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, u.id, b.modelId !== undefined ? b.modelId : existing.model_id, b.nickname ?? existing.nickname, b.brand ?? existing.brand,
         b.model ?? existing.model, b.batteryKwh ?? existing.battery_kwh, b.maxAcKw ?? existing.max_ac_kw, b.maxDcKw ?? existing.max_dc_kw,
         b.connectors ?? existing.connectors, b.curveProfile ?? existing.curve_profile, b.efficiencyWhPerKm ?? existing.efficiency_wh_km,
         b.currentSoc ?? existing.current_soc, b.targetSoc ?? existing.target_soc, b.isDefault ?? existing.is_default],
        c,
      );
    });
    return { vehicle: v };
  });

  app.delete('/me/vehicles/:id', async (req) => {
    const u = requireUser(req);
    await q('DELETE FROM user_vehicles WHERE id = $1 AND user_id = $2', [(req.params as any).id, u.id]);
    return { ok: true };
  });

  // ── Favorites ──────────────────────────────────────────────────────────────
  app.get('/me/favorites', async (req) => {
    const u = requireUser(req);
    const qy = req.query as any;
    const ids = (await q<{ station_id: string }>('SELECT station_id FROM favorites WHERE user_id = $1', [u.id])).map((r) => r.station_id);
    if (!ids.length) return { stations: [] };
    const near = qy.lat && qy.lng ? { lat: Number(qy.lat), lng: Number(qy.lng) } : null;
    const all = await listStations({ near, limit: 500, includeUnapproved: false });
    return { stations: all.filter((s) => ids.includes(s.id)) };
  });
  app.put('/me/favorites/:stationId', async (req) => {
    const u = requireUser(req);
    await q('INSERT INTO favorites(user_id, station_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, (req.params as any).stationId]);
    return { favorite: true };
  });
  app.delete('/me/favorites/:stationId', async (req) => {
    const u = requireUser(req);
    await q('DELETE FROM favorites WHERE user_id = $1 AND station_id = $2', [u.id, (req.params as any).stationId]);
    return { favorite: false };
  });

  // ── Saved places ───────────────────────────────────────────────────────────
  app.get('/me/places', async (req) => {
    const u = requireUser(req);
    return { places: await q(`SELECT id, label, address, ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM saved_places WHERE user_id = $1 ORDER BY created_at`, [u.id]) };
  });
  app.post('/me/places', async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({ label: z.string().trim().min(1).max(40), address: z.string().trim().min(1).max(200), lat: z.number(), lng: z.number() }), req.body);
    const p = await one(`INSERT INTO saved_places(user_id, label, address, location) VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($5,$4),4326)::geography)
                         RETURNING id, label, address`, [u.id, b.label, b.address, b.lat, b.lng]);
    return { place: p };
  });
  app.delete('/me/places/:id', async (req) => {
    const u = requireUser(req);
    await q('DELETE FROM saved_places WHERE id = $1 AND user_id = $2', [(req.params as any).id, u.id]);
    return { ok: true };
  });

  // ── Preferences ────────────────────────────────────────────────────────────
  app.patch('/me/preferences', async (req) => {
    const u = requireUser(req);
    const b = parse(
      z.object({
        minArrivalSoc: z.number().int().min(0).max(50).optional(),
        preferredNetworks: z.array(z.string()).optional(),
        avoidNetworks: z.array(z.string()).optional(),
        homeCity: z.string().max(80).nullable().optional(),
        notificationPrefs: z.record(z.enum(NOTIFICATION_TYPES), z.boolean()).optional(),
      }),
      req.body,
    );
    await q('INSERT INTO user_preferences(user_id) VALUES ($1) ON CONFLICT DO NOTHING', [u.id]);
    const row = await one(
      `UPDATE user_preferences SET
         min_arrival_soc = COALESCE($2, min_arrival_soc),
         preferred_networks = COALESCE($3, preferred_networks),
         avoid_networks = COALESCE($4, avoid_networks),
         home_city = CASE WHEN $6::boolean THEN $5 ELSE home_city END,
         notification_prefs = notification_prefs || COALESCE($7::jsonb, '{}'::jsonb),
         updated_at = now()
       WHERE user_id = $1 RETURNING *`,
      [u.id, b.minArrivalSoc ?? null, b.preferredNetworks ?? null, b.avoidNetworks ?? null, b.homeCity ?? null, b.homeCity !== undefined,
       b.notificationPrefs ? JSON.stringify(b.notificationPrefs) : null],
    );
    return { preferences: row };
  });

  // ── Notifications ──────────────────────────────────────────────────────────
  app.get('/me/notifications', async (req) => {
    const u = requireUser(req);
    const rows = await q('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [u.id]);
    const unread = await one<any>('SELECT COUNT(*)::int n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [u.id]);
    return { notifications: rows, unread: unread.n };
  });
  app.post('/me/notifications/read', async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({ ids: z.array(z.string().uuid()).optional() }), req.body ?? {});
    if (b.ids?.length) await q('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2) AND read_at IS NULL', [u.id, b.ids]);
    else await q('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [u.id]);
    return { ok: true };
  });

  // ── Payment methods ────────────────────────────────────────────────────────
  app.get('/me/payment-methods', async (req) => {
    const u = requireUser(req);
    return { methods: await q('SELECT id, type, provider, label, brand, last4, is_default, created_at FROM payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at', [u.id]) };
  });
  app.post('/me/payment-methods', async (req) => {
    const u = requireUser(req);
    const b = parse(
      z.object({
        type: z.enum(['card', 'wallet', 'local_gateway']),
        provider: z.string().min(2).max(30),
        label: z.string().trim().min(2).max(60),
        brand: z.string().max(20).optional(),
        last4: z.string().regex(/^\d{4}$/).optional(),
        providerRef: z.string().max(200).optional(),
        isDefault: z.boolean().default(false),
      }),
      req.body,
    );
    // Real card data never touches this API: tokenise with the provider's client SDK and send only providerRef.
    const m = await tx(async (c) => {
      const n = await one<any>('SELECT COUNT(*)::int n FROM payment_methods WHERE user_id = $1', [u.id], c);
      const def = b.isDefault || n.n === 0;
      if (def) await c.query('UPDATE payment_methods SET is_default = false WHERE user_id = $1', [u.id]);
      return one('INSERT INTO payment_methods(user_id, type, provider, label, brand, last4, provider_ref, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, type, provider, label, brand, last4, is_default',
        [u.id, b.type, b.provider, b.label, b.brand ?? null, b.last4 ?? null, b.providerRef ?? null, def], c);
    });
    return { method: m };
  });
  app.delete('/me/payment-methods/:id', async (req) => {
    const u = requireUser(req);
    await q('DELETE FROM payment_methods WHERE id = $1 AND user_id = $2', [(req.params as any).id, u.id]);
    return { ok: true };
  });

  // ── Charging history & invoices ───────────────────────────────────────────
  app.get('/me/sessions', async (req) => {
    const u = requireUser(req);
    const rows = await q<any>(
      `SELECT cs.id, cs.status, cs.started_at, cs.ended_at, cs.energy_kwh, cs.cost_total, cs.currency, cs.start_soc, cs.current_soc, cs.target_soc,
              cs.power_kw, cs.control_source, cs.is_demo, s.id station_id, s.name station_name, s.city, p.label port_label, p.connector_type, p.max_power_kw,
              v.nickname vehicle_name, v.brand vehicle_brand, v.model vehicle_model, i.id invoice_id, i.number invoice_number, i.payment_status
         FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id LEFT JOIN ports p ON p.id = cs.port_id
         LEFT JOIN user_vehicles v ON v.id = cs.vehicle_id LEFT JOIN invoices i ON i.session_id = cs.id
        WHERE cs.user_id = $1 ORDER BY cs.started_at DESC LIMIT 200`,
      [u.id],
    );
    const totals = await one<any>(
      `SELECT COUNT(*)::int sessions, COALESCE(SUM(energy_kwh),0)::float energy, COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))/60),0)::float minutes
         FROM charging_sessions WHERE user_id = $1 AND status IN ('completed','stopped')`,
      [u.id],
    );
    const spend = await q<any>(`SELECT currency, SUM(cost_total)::float total FROM charging_sessions WHERE user_id = $1 AND status IN ('completed','stopped') GROUP BY currency`, [u.id]);
    return { sessions: rows, totals: { ...totals, spend } };
  });

  app.get('/me/invoices/:id', async (req) => {
    const u = requireUser(req);
    const inv = await one<any>(
      `SELECT i.*, s.name station_name, s.address station_address, s.city, c.name company_name, c.tax_id company_tax_id, cs.started_at, cs.ended_at,
              cs.energy_kwh, p.label port_label, p.connector_type, us.full_name, us.email
         FROM invoices i LEFT JOIN charging_sessions cs ON cs.id = i.session_id LEFT JOIN stations s ON s.id = cs.station_id
         LEFT JOIN companies c ON c.id = i.company_id LEFT JOIN ports p ON p.id = cs.port_id JOIN users us ON us.id = i.user_id
        WHERE i.id = $1`,
      [(req.params as any).id],
    );
    if (!inv) throw notFound('Invoice not found');
    if (inv.user_id !== u.id && u.role !== 'admin') throw forbidden();
    return { invoice: inv };
  });

  // ── Charging sessions ─────────────────────────────────────────────────────
  app.post('/sessions', async (req) => {
    const u = requireUser(req);
    const b = parse(
      z.object({
        portId: z.string().uuid(), vehicleId: z.string().uuid(), startSoc: z.number().min(0).max(99).optional(),
        targetSoc: z.number().min(1).max(100), paymentMethodId: z.string().uuid().nullable().optional(),
      }),
      req.body,
    );
    return { session: await startSession(u, b) };
  });
  app.get('/sessions/active', async (req) => {
    const u = requireUser(req);
    const s = await one<any>(`SELECT id FROM charging_sessions WHERE user_id = $1 AND status IN ('pending','active') ORDER BY started_at DESC LIMIT 1`, [u.id]);
    return { session: s ? await getSessionFull(s.id) : null };
  });
  app.get('/sessions/:id', async (req) => {
    const u = requireUser(req);
    const s = await getSessionFull((req.params as any).id);
    if (!s) throw notFound('Session not found');
    if (s.user_id !== u.id && u.role !== 'admin' && !u.companyIds.length) throw forbidden();
    const invoice = await one('SELECT id, number, amount, currency, payment_status FROM invoices WHERE session_id = $1', [s.id]);
    return { session: s, invoice };
  });
  app.post('/sessions/:id/stop', async (req) => {
    const u = requireUser(req);
    return { session: await stopSession(u, (req.params as any).id) };
  });

  // ── Reservations ──────────────────────────────────────────────────────────
  app.get('/stations/:id/reservation-slots', async (req) => {
    const { id } = req.params as any;
    const qy = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), portId: z.string().uuid().optional() }), req.query);
    const st = await one<any>('SELECT reservations_enabled, timezone, reservation_fee FROM stations WHERE id = $1', [id]);
    if (!st) throw notFound();
    if (!st.reservations_enabled) return { enabled: false, slots: [] };
    const from = qy.date ? new Date(`${qy.date}T00:00:00Z`) : new Date();
    const to = new Date(from.getTime() + 24 * 3600_000);
    const busy = await q<any>(
      `SELECT port_id, start_at, end_at FROM reservations WHERE station_id = $1 AND status IN ('confirmed','active') AND end_at > $2 AND start_at < $3
         ${qy.portId ? 'AND port_id = $4' : ''}`,
      qy.portId ? [id, from, to, qy.portId] : [id, from, to],
    );
    return { enabled: true, fee: st.reservation_fee, timezone: st.timezone, busy };
  });

  app.get('/me/reservations', async (req) => {
    const u = requireUser(req);
    return {
      reservations: await q(
        `SELECT r.*, s.name station_name, s.address, p.label port_label, p.connector_type, p.max_power_kw
           FROM reservations r JOIN stations s ON s.id = r.station_id JOIN ports p ON p.id = r.port_id
          WHERE r.user_id = $1 ORDER BY r.start_at DESC LIMIT 100`,
        [u.id],
      ),
    };
  });

  app.post('/reservations', async (req) => {
    const u = requireUser(req);
    const b = parse(
      z.object({ portId: z.string().uuid(), vehicleId: z.string().uuid().optional(), startAt: z.string().datetime(), durationMinutes: z.number().int().min(15).max(180) }),
      req.body,
    );
    const start = new Date(b.startAt);
    if (start.getTime() < Date.now() - 5 * 60_000) throw badRequest('Choose a start time in the future');
    if (start.getTime() > Date.now() + 7 * 86400_000) throw badRequest('Reservations can be made up to 7 days ahead');
    const end = new Date(start.getTime() + b.durationMinutes * 60_000);
    const port = await one<any>(
      `SELECT p.*, s.reservations_enabled, s.reservation_fee, s.integration_type, s.name station_name, t.config tariff,
              (SELECT id FROM charge_points WHERE station_id = s.id LIMIT 1) cp
         FROM ports p JOIN stations s ON s.id = p.station_id LEFT JOIN tariffs t ON t.id = s.tariff_id WHERE p.id = $1`,
      [b.portId],
    );
    if (!port) throw notFound('Port not found');
    if (!port.reservations_enabled) throw badRequest('This station does not accept reservations');
    if (['out_of_service', 'offline', 'no_power'].includes(port.status)) throw conflict('This port is not working right now');
    if (b.vehicleId) {
      const v = await one<any>('SELECT connectors FROM user_vehicles WHERE id = $1 AND user_id = $2', [b.vehicleId, u.id]);
      if (!v) throw badRequest('Vehicle not found');
      if (!v.connectors.includes(port.connector_type)) throw badRequest(`Your vehicle is not compatible with ${port.connector_type}`);
    }
    const r = await tx(async (c) => {
      await c.query('SELECT id FROM ports WHERE id = $1 FOR UPDATE', [b.portId]);
      const clash = await one(
        `SELECT 1 FROM reservations WHERE port_id = $1 AND status IN ('confirmed','active') AND start_at < $3 AND end_at > $2`,
        [b.portId, start, end], c,
      );
      if (clash) throw conflict('That time slot is already booked');
      const mine = await one(`SELECT 1 FROM reservations WHERE user_id = $1 AND status = 'confirmed' AND start_at < $3 AND end_at > $2`, [u.id, start, end], c);
      if (mine) throw conflict('You already have a reservation at that time');
      return one<any>(
        `INSERT INTO reservations(user_id, station_id, port_id, vehicle_id, start_at, end_at, fee, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [u.id, port.station_id, b.portId, b.vehicleId ?? null, start, end, port.reservation_fee, port.tariff?.currency ?? 'PKR'], c,
      );
    });
    const controller = controllerFor(port.integration_type);
    // Reservations starting within 15 minutes hold the port immediately.
    if (start.getTime() - Date.now() < 15 * 60_000) {
      try {
        await controller?.reserve?.({ reservationId: r.id, portId: b.portId, chargePointId: port.cp, ocppConnectorId: port.ocpp_connector_id, expiresAt: end, idTag: idTagFor(u.id) });
      } catch {
        /* charger may reject; the reservation still stands in Voltway */
      }
      if (port.status === 'available') await setPortStatus(b.portId, 'reserved', port.integration_type === 'ocpp' ? 'live' : port.integration_type === 'simulator' ? 'simulated' : 'operator_reported');
    }
    await notify(u.id, 'reservation_reminder', 'Reservation confirmed', `${port.station_name} · ${port.label} on ${start.toUTCString().slice(0, 22)} UTC`, { reservationId: r.id }, `resv-confirm:${r.id}`);
    return { reservation: r };
  });

  app.post('/reservations/:id/cancel', async (req) => {
    const u = requireUser(req);
    const r = await one<any>(
      `UPDATE reservations SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'confirmed' RETURNING *`,
      [(req.params as any).id, u.id],
    );
    if (!r) throw notFound('Reservation not found or cannot be cancelled');
    const port = await one<any>('SELECT p.status, s.integration_type FROM ports p JOIN stations s ON s.id = p.station_id WHERE p.id = $1', [r.port_id]);
    if (port?.status === 'reserved') await setPortStatus(r.port_id, 'available', port.integration_type === 'ocpp' ? 'live' : port.integration_type === 'simulator' ? 'simulated' : 'operator_reported');
    return { reservation: r };
  });

  // ── Complaints / support ──────────────────────────────────────────────────
  app.post('/complaints', async (req) => {
    const u = requireUser(req);
    const b = parse(
      z.object({
        stationId: z.string().uuid().optional(), category: z.enum(['billing', 'charger_fault', 'station_info', 'app', 'reservation', 'other']).default('other'),
        subject: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(3000),
      }),
      req.body,
    );
    const companyId = b.stationId ? (await one<any>('SELECT company_id FROM stations WHERE id = $1', [b.stationId]))?.company_id ?? null : null;
    const c = await one('INSERT INTO complaints(user_id, station_id, company_id, category, subject, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [u.id, b.stationId ?? null, companyId, b.category, b.subject, b.description]);
    return { complaint: c };
  });
  app.get('/me/complaints', async (req) => {
    const u = requireUser(req);
    return { complaints: await q('SELECT c.*, s.name station_name FROM complaints c LEFT JOIN stations s ON s.id = c.station_id WHERE c.user_id = $1 ORDER BY c.created_at DESC', [u.id]) };
  });
}
