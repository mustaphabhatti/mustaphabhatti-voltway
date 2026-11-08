import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AMENITIES, CONNECTOR_CURRENT, CONNECTOR_TYPES, PAYMENT_METHODS, type PortStatus } from '@voltway/shared';
import { q, one, tx } from '../db';
import { requireRole, requireUser } from '../lib/auth';
import { audit } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { setPortStatus } from '../services/portStatus';
import { getStation } from '../services/stations';
import { UPLOAD_DIR } from './operator';

const displayName = (full: string) => {
  const [a, b] = full.split(' ');
  return b ? `${a} ${b[0]}.` : a;
};

export const BADGES = [
  { id: 'first_checkin', label: 'First check-in', test: (s: any) => s.checkins >= 1 },
  { id: 'regular', label: 'Regular (10 check-ins)', test: (s: any) => s.checkins >= 10 },
  { id: 'road_warrior', label: 'Road warrior (5 cities)', test: (s: any) => s.cities >= 5 },
  { id: 'photographer', label: 'Photographer (3 photos)', test: (s: any) => s.photos >= 3 },
  { id: 'trailblazer', label: 'Trailblazer (added a station)', test: (s: any) => s.stations >= 1 },
  { id: 'reviewer', label: 'Reviewer (5 reviews)', test: (s: any) => s.reviews >= 5 },
];

async function savePhoto(file: any, folder: string) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.mimetype)) throw badRequest('Upload a JPG, PNG, WebP or HEIC photo');
  const name = `${randomUUID()}${extname(file.filename) || '.jpg'}`;
  await mkdir(join(UPLOAD_DIR, folder), { recursive: true });
  await pipeline(file.file, createWriteStream(join(UPLOAD_DIR, folder, name)));
  if (file.file.truncated) throw badRequest('Photo too large (max 8 MB)');
  return `/api/uploads/${folder}/${name}`;
}

export async function communityRoutes(app: FastifyInstance) {
  // ── Check-ins ─────────────────────────────────────────────────────────────
  app.get('/stations/:id/checkins', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const rows = await q<any>(
      `SELECT c.id, c.outcome, c.problem, c.kw_observed, c.duration_min, c.comment, c.photo_url, c.vehicle_label, c.created_at, c.charging_until,
              c.user_id, u.full_name, p.label AS port_label, p.connector_type,
              (SELECT COUNT(*)::int FROM checkins c2 WHERE c2.user_id = c.user_id) AS user_checkins
         FROM checkins c JOIN users u ON u.id = c.user_id LEFT JOIN ports p ON p.id = c.port_id
        WHERE c.station_id = $1 AND c.status = 'visible' ORDER BY c.created_at DESC LIMIT 100`,
      [id],
    );
    const stats = await one<any>(
      `SELECT COUNT(*) FILTER (WHERE outcome IN ('charged','charging_now'))::int ok, COUNT(*) FILTER (WHERE outcome = 'could_not_charge')::int fail,
              COUNT(*) FILTER (WHERE outcome = 'waiting')::int waiting, COUNT(*)::int total,
              ROUND(AVG(kw_observed) FILTER (WHERE kw_observed IS NOT NULL)::numeric, 1)::float avg_kw
         FROM checkins WHERE station_id = $1 AND status = 'visible' AND created_at > now() - interval '365 days'`,
      [id],
    );
    return { checkins: rows.map(({ full_name, ...r }) => ({ ...r, author: displayName(full_name) })), stats };
  });

  app.post('/stations/:id/checkins', async (req) => {
    const u = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(
      z.object({
        outcome: z.enum(['charged', 'could_not_charge', 'waiting', 'charging_now', 'comment']),
        portId: z.string().uuid().optional().nullable(),
        problem: z.enum(['broken', 'occupied', 'blocked_by_ice', 'no_power', 'payment_failed', 'slow', 'access', 'other']).optional().nullable(),
        kwObserved: z.number().min(0.5).max(1000).optional().nullable(),
        durationMin: z.number().int().min(1).max(1440).optional().nullable(),
        comment: z.string().trim().max(1000).default(''),
        vehicleLabel: z.string().trim().max(60).optional().nullable(),
      }),
      req.body,
    );
    const st = await one<any>('SELECT id, name, integration_type, listing_status FROM stations WHERE id = $1', [id]);
    if (!st || st.listing_status !== 'approved') throw notFound('Station not found');
    if (b.outcome === 'comment' && !b.comment) throw badRequest('Write a comment');
    if (b.outcome === 'could_not_charge' && !b.problem) throw badRequest('Tell other drivers what went wrong');
    if (b.portId && !(await one('SELECT 1 FROM ports WHERE id = $1 AND station_id = $2', [b.portId, id]))) throw badRequest('Port not found at this station');
    // Rate-limit: one check-in per station per user every 10 minutes
    const recent = await one(`SELECT 1 FROM checkins WHERE user_id = $1 AND station_id = $2 AND created_at > now() - interval '10 minutes'`, [u.id, id]);
    if (recent) throw conflict('You checked in here a moment ago. Try again in a few minutes.');
    let vehicleLabel = b.vehicleLabel ?? null;
    if (!vehicleLabel) {
      const v = await one<any>('SELECT brand, model FROM user_vehicles WHERE user_id = $1 ORDER BY is_default DESC LIMIT 1', [u.id]);
      if (v) vehicleLabel = `${v.brand} ${v.model}`;
    }
    const chargingUntil = b.outcome === 'charging_now' ? new Date(Date.now() + (b.durationMin ?? 45) * 60_000) : null;
    const c = await one<any>(
      `INSERT INTO checkins(station_id, port_id, user_id, vehicle_label, outcome, problem, kw_observed, duration_min, comment, charging_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, b.portId ?? null, u.id, vehicleLabel, b.outcome, b.problem ?? null, b.kwObserved ?? null, b.durationMin ?? null, b.comment, chargingUntil],
    );
    // Without a live feed, driver check-ins update the displayed status (labelled "Driver report").
    let statusUpdated = false;
    if (b.portId && st.integration_type === 'none') {
      let next: PortStatus | null = null;
      if (b.outcome === 'charging_now') next = 'occupied';
      else if (b.outcome === 'charged') next = 'available';
      else if (b.outcome === 'could_not_charge' && b.problem === 'broken') next = 'out_of_service';
      else if (b.outcome === 'could_not_charge' && b.problem === 'no_power') next = 'no_power';
      if (next) { await setPortStatus(b.portId, next, 'user_reported'); statusUpdated = true; }
    }
    return { checkin: c, statusUpdated };
  });

  app.delete('/checkins/:id', async (req) => {
    const u = requireUser(req);
    const r = await one<any>('DELETE FROM checkins WHERE id = $1 AND (user_id = $2 OR $3) RETURNING id', [(req.params as any).id, u.id, u.role === 'admin']);
    if (!r) throw notFound();
    return { ok: true };
  });

  // ── Photos ────────────────────────────────────────────────────────────────
  app.get('/stations/:id/photos', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const rows = await q<any>(
      `SELECT ph.id, ph.url, ph.caption, ph.created_at, u.full_name FROM station_photos ph LEFT JOIN users u ON u.id = ph.user_id
        WHERE ph.station_id = $1 AND ph.status = 'visible' ORDER BY ph.created_at DESC LIMIT 60`,
      [id],
    );
    return { photos: rows.map(({ full_name, ...r }) => ({ ...r, author: full_name ? displayName(full_name) : 'Operator' })) };
  });

  app.post('/stations/:id/photos', async (req) => {
    const u = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await one(`SELECT 1 FROM stations WHERE id = $1`, [id]))) throw notFound();
    const file = await req.file();
    if (!file) throw badRequest('Attach a photo');
    const url = await savePhoto(file, 'community');
    const fields = file.fields as any;
    const caption = String(fields?.caption?.value ?? '').slice(0, 200);
    const checkinId = fields?.checkinId?.value || null;
    const ph = await one<any>('INSERT INTO station_photos(station_id, user_id, checkin_id, url, caption) VALUES ($1,$2,$3,$4,$5) RETURNING *', [id, u.id, checkinId, url, caption]);
    if (checkinId) await q('UPDATE checkins SET photo_url = $2 WHERE id = $1 AND user_id = $3', [checkinId, url, u.id]);
    return { photo: ph };
  });

  // ── Activity feed ─────────────────────────────────────────────────────────
  app.get('/activity', async (req) => {
    const qy = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), radiusKm: z.coerce.number().min(1).max(500).default(50), limit: z.coerce.number().min(1).max(100).default(40) }), req.query);
    const params: unknown[] = [qy.limit];
    let near = '';
    if (qy.lat != null && qy.lng != null) {
      params.push(qy.lng, qy.lat, qy.radiusKm * 1000);
      near = `AND ST_DWithin(s.location, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4)`;
    }
    const rows = await q<any>(
      `SELECT c.id, c.outcome, c.problem, c.kw_observed, c.comment, c.photo_url, c.vehicle_label, c.created_at,
              s.id station_id, s.name station_name, s.city, u.full_name
         FROM checkins c JOIN stations s ON s.id = c.station_id JOIN users u ON u.id = c.user_id
        WHERE c.status = 'visible' AND s.listing_status = 'approved' ${near}
        ORDER BY c.created_at DESC LIMIT $1`,
      params,
    );
    return { activity: rows.map(({ full_name, ...r }) => ({ ...r, author: displayName(full_name) })) };
  });

  // ── Driver-submitted stations ─────────────────────────────────────────────
  app.post('/community/stations', async (req) => {
    const u = requireUser(req);
    const b = parse(
      z.object({
        name: z.string().trim().min(3).max(100),
        address: z.string().trim().min(5).max(200),
        city: z.string().trim().min(2).max(80),
        country: z.string().trim().length(2).default('PK'),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        timezone: z.string().default('Asia/Karachi'),
        locationType: z.enum(['public', 'destination', 'dealership', 'workplace', 'residential', 'highway']).default('public'),
        accessType: z.enum(['public', 'restricted', 'private']).default('public'),
        comingSoon: z.boolean().default(false),
        is24_7: z.boolean().default(false),
        amenities: z.array(z.enum(AMENITIES)).default([]),
        paymentMethods: z.array(z.enum(PAYMENT_METHODS)).default([]),
        notes: z.string().trim().max(1000).optional(),
        priceNote: z.string().trim().max(200).optional(),
        networkName: z.string().trim().max(80).optional(),
        ports: z.array(z.object({ connectorType: z.enum(CONNECTOR_TYPES), maxPowerKw: z.number().positive().max(1000), count: z.number().int().min(1).max(20).default(1) })).max(10).default([]),
      }),
      req.body,
    );
    if (!b.comingSoon && !b.ports.length) throw badRequest('Add at least one connector (or mark it as coming soon)');
    const dup = await one<any>(
      `SELECT id, name FROM stations WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 60) LIMIT 1`, [b.lng, b.lat]);
    if (dup) throw conflict(`"${dup.name}" is already listed at this spot. Check in there or suggest an edit instead.`);
    const company = await one<any>(`SELECT id FROM companies WHERE is_community LIMIT 1`);
    if (!company) throw badRequest('Community submissions are not enabled');
    const notes = [b.networkName && `Network: ${b.networkName}`, b.priceNote && `Price: ${b.priceNote}`, b.notes].filter(Boolean).join('\n') || null;
    const station = await tx(async (c) => {
      const s = await one<any>(
        `INSERT INTO stations(company_id, name, description, address, city, country, location, timezone, is_24_7, amenities, payment_methods, access_type,
                              listing_status, coming_soon, submitted_by, location_type, host_notes, data_source)
         VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($8,$7),4326)::geography, $9,$10,$11,$12,$13,'pending',$14,$15,$16,$17,'community') RETURNING id`,
        [company.id, b.name, b.locationType === 'residential' ? 'Home charger shared by a Voltway driver.' : 'Added by the Voltway driver community.', b.address, b.city, b.country,
         b.lat, b.lng, b.timezone, b.is24_7, b.amenities, b.paymentMethods, b.locationType === 'residential' ? 'restricted' : b.accessType, b.comingSoon, u.id, b.locationType, notes],
        c,
      );
      let n = 1;
      for (const p of b.ports)
        for (let i = 0; i < p.count; i++)
          await c.query(
            `INSERT INTO ports(station_id, label, connector_type, current_type, max_power_kw, status, status_source, status_updated_at) VALUES ($1,$2,$3,$4,$5,'unknown','user_reported',now())`,
            [s.id, `${CONNECTOR_CURRENT[p.connectorType]}-${n++}`, p.connectorType, CONNECTOR_CURRENT[p.connectorType], p.maxPowerKw],
          );
      return s;
    });
    await audit(u.id, 'community.station_submit', 'station', station.id, { name: b.name });
    return { station: await getStation(station.id) };
  });

  app.get('/me/contributions', async (req) => {
    const u = requireUser(req);
    const stats = await one<any>(
      `SELECT (SELECT COUNT(*)::int FROM checkins WHERE user_id = $1) checkins,
              (SELECT COUNT(DISTINCT s.city)::int FROM checkins c JOIN stations s ON s.id = c.station_id WHERE c.user_id = $1) cities,
              (SELECT COUNT(*)::int FROM station_photos WHERE user_id = $1 AND status = 'visible') photos,
              (SELECT COUNT(*)::int FROM stations WHERE submitted_by = $1) stations,
              (SELECT COUNT(*)::int FROM reviews WHERE user_id = $1) reviews`,
      [u.id],
    );
    const checkins = await q<any>(
      `SELECT c.id, c.outcome, c.problem, c.comment, c.kw_observed, c.created_at, s.id station_id, s.name station_name, s.city
         FROM checkins c JOIN stations s ON s.id = c.station_id WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 50`, [u.id]);
    const stations = await q<any>(
      `SELECT id, name, city, listing_status, coming_soon, location_type, rejection_reason, created_at FROM stations WHERE submitted_by = $1 ORDER BY created_at DESC`, [u.id]);
    return { stats, badges: BADGES.map((b) => ({ id: b.id, label: b.label, earned: b.test(stats) })), checkins, stations };
  });

  // ── Operator & admin views ────────────────────────────────────────────────
  app.get('/operator/checkins', async (req) => {
    const user = requireRole(req, 'operator', 'admin');
    const companyId = (req.query as any)?.companyId ?? user.companyIds[0];
    if (!companyId) throw notFound('No company');
    if (user.role !== 'admin' && !user.companyIds.includes(companyId)) throw notFound();
    const rows = await q<any>(
      `SELECT c.*, s.name station_name, p.label port_label, u.full_name FROM checkins c JOIN stations s ON s.id = c.station_id
         LEFT JOIN ports p ON p.id = c.port_id JOIN users u ON u.id = c.user_id
        WHERE s.company_id = $1 ORDER BY c.created_at DESC LIMIT 200`, [companyId]);
    return { checkins: rows.map(({ full_name, ...r }) => ({ ...r, author: displayName(full_name) })) };
  });

  app.get('/admin/photos', async (req) => {
    requireRole(req, 'admin');
    return { photos: await q(`SELECT ph.*, s.name station_name, u.full_name, u.email FROM station_photos ph JOIN stations s ON s.id = ph.station_id LEFT JOIN users u ON u.id = ph.user_id ORDER BY ph.created_at DESC LIMIT 200`) };
  });
  app.post('/admin/photos/:id/moderate', async (req) => {
    const admin = requireRole(req, 'admin');
    const b = parse(z.object({ status: z.enum(['visible', 'hidden']) }), req.body);
    await q('UPDATE station_photos SET status = $2 WHERE id = $1', [(req.params as any).id, b.status]);
    await audit(admin.id, `photo.${b.status}`, 'station_photo', (req.params as any).id);
    return { ok: true };
  });
  app.post('/admin/checkins/:id/moderate', async (req) => {
    const admin = requireRole(req, 'admin');
    const b = parse(z.object({ status: z.enum(['visible', 'hidden']) }), req.body);
    await q('UPDATE checkins SET status = $2 WHERE id = $1', [(req.params as any).id, b.status]);
    await audit(admin.id, `checkin.${b.status}`, 'checkin', (req.params as any).id);
    return { ok: true };
  });
}
