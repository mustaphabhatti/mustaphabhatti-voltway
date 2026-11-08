import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AMENITIES, CONNECTOR_CURRENT, CONNECTOR_TYPES, PAYMENT_METHODS, PORT_STATUSES, type PortStatus } from '@wattly/shared';
import { config } from '../config';
import { q, one, tx } from '../db';
import { assertCompanyAccess, requireRole, requireUser, type AuthUser } from '../lib/auth';
import { audit } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import { parse, zTime } from '../lib/validate';
import { getStation, listStations } from '../services/stations';
import { setPortStatus } from '../services/portStatus';
import { notifyFavorites } from '../services/notifications';
import { isChargePointConnected } from '../integrations/charging/ocpp16';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');

async function companyFor(req: FastifyRequest): Promise<{ user: AuthUser; companyId: string }> {
  const user = requireRole(req, 'operator', 'admin');
  const requested = (req.query as any)?.companyId as string | undefined;
  const companyId = requested ?? user.companyIds[0];
  if (!companyId) throw notFound('Register your company first');
  assertCompanyAccess(user, companyId);
  return { user, companyId };
}

async function stationOwned(req: FastifyRequest, stationId: string) {
  const user = requireRole(req, 'operator', 'admin');
  const s = await one<any>('SELECT id, company_id, listing_status, name FROM stations WHERE id = $1', [stationId]);
  if (!s) throw notFound('Station not found');
  assertCompanyAccess(user, s.company_id);
  return { user, station: s };
}

async function portOwned(req: FastifyRequest, portId: string) {
  const user = requireRole(req, 'operator', 'admin');
  const p = await one<any>('SELECT p.*, s.company_id, s.integration_type FROM ports p JOIN stations s ON s.id = p.station_id WHERE p.id = $1', [portId]);
  if (!p) throw notFound('Port not found');
  assertCompanyAccess(user, p.company_id);
  return { user, port: p };
}

const companySchema = z.object({
  name: z.string().trim().min(2).max(80),
  legalName: z.string().trim().max(120).optional(),
  registrationNumber: z.string().trim().max(60).optional(),
  taxId: z.string().trim().max(60).optional(),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6).max(20),
  website: z.string().trim().url().optional().or(z.literal('')),
  address: z.string().trim().min(5).max(200),
  country: z.string().trim().length(2).default('PK'),
  description: z.string().trim().max(1000).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const hoursSchema = z.array(z.object({ day: z.number().int().min(0).max(6), open: zTime, close: zTime })).max(21);

const portSchema = z.object({
  label: z.string().trim().min(1).max(30),
  evseUid: z.string().trim().max(60).optional().nullable(),
  connectorType: z.enum(CONNECTOR_TYPES),
  maxPowerKw: z.number().positive().max(1000),
  voltage: z.number().int().min(100).max(1500).optional().nullable(),
  amperage: z.number().int().min(6).max(1000).optional().nullable(),
  powerGroup: z.string().trim().max(30).optional().nullable(),
  ocppConnectorId: z.number().int().min(1).max(20).optional().nullable(),
  tariffId: z.string().uuid().optional().nullable(),
});

const stationSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(2000).optional().nullable(),
  address: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().length(2).default('PK'),
  postalCode: z.string().trim().max(20).optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Unknown timezone').default('Asia/Karachi'),
  phone: z.string().trim().max(20).optional().nullable(),
  is24_7: z.boolean().default(false),
  openingHours: hoursSchema.default([]),
  amenities: z.array(z.enum(AMENITIES)).default([]),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).default([]),
  parkingInfo: z.string().trim().max(300).optional().nullable(),
  accessType: z.enum(['public', 'restricted', 'private']).default('public'),
  tariffId: z.string().uuid().optional().nullable(),
  reservationsEnabled: z.boolean().default(false),
  reservationFee: z.number().min(0).max(100000).default(0),
  integrationType: z.enum(['none', 'simulator', 'ocpp', 'operator_api']).default('none'),
  ports: z.array(portSchema).max(50).optional(),
});

export async function operatorRoutes(app: FastifyInstance) {
  // ── Company ───────────────────────────────────────────────────────────────
  app.post('/operator/company', async (req) => {
    const user = requireUser(req);
    if (user.role === 'operator' && user.companyIds.length) throw conflict('You already manage a company');
    const b = parse(companySchema, req.body);
    const slugBase = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const company = await tx(async (c) => {
      const exists = await one('SELECT 1 FROM companies WHERE slug = $1', [slugBase], c);
      const slug = exists ? `${slugBase}-${Math.random().toString(36).slice(2, 6)}` : slugBase;
      const co = await one<any>(
        `INSERT INTO companies(name, slug, legal_name, registration_number, tax_id, email, phone, website, address, country, description, brand_color, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'#10b981'),$13) RETURNING *`,
        [b.name, slug, b.legalName ?? null, b.registrationNumber ?? null, b.taxId ?? null, b.email, b.phone, b.website || null, b.address, b.country,
         b.description ?? null, b.brandColor ?? null, user.id], c,
      );
      await c.query('INSERT INTO company_members(company_id, user_id, member_role) VALUES ($1,$2,$3)', [co.id, user.id, 'owner']);
      if (user.role === 'driver') await c.query(`UPDATE users SET role = 'operator' WHERE id = $1`, [user.id]);
      return co;
    });
    await audit(user.id, 'company.register', 'company', company.id, { name: b.name });
    return { company };
  });

  app.get('/operator/company', async (req) => {
    const { companyId } = await companyFor(req);
    const company = await one('SELECT * FROM companies WHERE id = $1', [companyId]);
    const members = await q(
      `SELECT u.id, u.full_name, u.email, cm.member_role FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE cm.company_id = $1`, [companyId]);
    return { company, members };
  });

  app.patch('/operator/company', async (req) => {
    const { user, companyId } = await companyFor(req);
    const b = parse(companySchema.partial(), req.body);
    const co = await one(
      `UPDATE companies SET name = COALESCE($2,name), legal_name = COALESCE($3,legal_name), registration_number = COALESCE($4,registration_number),
              tax_id = COALESCE($5,tax_id), email = COALESCE($6,email), phone = COALESCE($7,phone), website = COALESCE($8,website),
              address = COALESCE($9,address), description = COALESCE($10,description), brand_color = COALESCE($11,brand_color)
        WHERE id = $1 RETURNING *`,
      [companyId, b.name ?? null, b.legalName ?? null, b.registrationNumber ?? null, b.taxId ?? null, b.email ?? null, b.phone ?? null,
       b.website ?? null, b.address ?? null, b.description ?? null, b.brandColor ?? null],
    );
    await audit(user.id, 'company.update', 'company', companyId, b);
    return { company: co };
  });

  app.post('/operator/company/documents', async (req) => {
    const { user, companyId } = await companyFor(req);
    const file = await req.file();
    if (!file) throw badRequest('Attach a document');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) throw badRequest('Upload a PDF, JPG or PNG');
    const name = `${randomUUID()}${extname(file.filename) || '.pdf'}`;
    await mkdir(join(UPLOAD_DIR, 'documents'), { recursive: true });
    await pipeline(file.file, createWriteStream(join(UPLOAD_DIR, 'documents', name)));
    if (file.file.truncated) throw badRequest('File too large (max 8 MB)');
    const doc = { name: file.filename, path: `documents/${name}`, uploadedAt: new Date().toISOString(), kind: (file.fields as any)?.kind?.value ?? 'registration' };
    await q(`UPDATE companies SET documents = documents || $2::jsonb, verification_status = CASE WHEN verification_status = 'rejected' THEN 'pending' ELSE verification_status END WHERE id = $1`, [companyId, JSON.stringify([doc])]);
    await audit(user.id, 'company.document', 'company', companyId, { name: file.filename });
    return { document: doc };
  });

  // ── Overview ──────────────────────────────────────────────────────────────
  app.get('/operator/overview', async (req) => {
    const { companyId } = await companyFor(req);
    const stations = await listStations({ companyId, includeUnapproved: true, limit: 500 });
    const ports = stations.flatMap((s) => s.ports.map((p) => ({ ...p, stationName: s.name, stationId: s.id })));
    const today = await one<any>(
      `SELECT COUNT(*)::int sessions, COALESCE(SUM(cs.energy_kwh),0)::float energy, COALESCE(SUM(cs.cost_total),0)::float revenue
         FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id WHERE s.company_id = $1 AND cs.started_at >= date_trunc('day', now())`,
      [companyId],
    );
    const active = await one<any>(`SELECT COUNT(*)::int n FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id WHERE s.company_id = $1 AND cs.status = 'active'`, [companyId]);
    const upcoming = await one<any>(`SELECT COUNT(*)::int n FROM reservations r JOIN stations s ON s.id = r.station_id WHERE s.company_id = $1 AND r.status = 'confirmed' AND r.start_at > now()`, [companyId]);
    const recentReviews = await q(
      `SELECT r.id, r.rating, r.comment, r.created_at, s.name station_name FROM reviews r JOIN stations s ON s.id = r.station_id
        WHERE s.company_id = $1 ORDER BY r.created_at DESC LIMIT 5`, [companyId]);
    const alerts = ports
      .filter((p) => ['out_of_service', 'offline', 'no_power'].includes(p.status) || p.statusStale)
      .slice(0, 12)
      .map((p) => ({ stationId: p.stationId, stationName: p.stationName, portId: p.id, label: p.label, status: p.status, stale: p.statusStale, updatedAt: p.statusUpdatedAt }));
    const statusCounts = Object.fromEntries(PORT_STATUSES.map((s) => [s, ports.filter((p) => p.status === s).length]));
    return {
      stations: { total: stations.length, approved: stations.filter((s) => s.listingStatus === 'approved').length, pending: stations.filter((s) => s.listingStatus === 'pending').length, draft: stations.filter((s) => s.listingStatus === 'draft').length, rejected: stations.filter((s) => s.listingStatus === 'rejected').length },
      ports: { total: ports.length, statusCounts },
      today, activeSessions: active.n, upcomingReservations: upcoming.n, recentReviews, alerts,
    };
  });

  // ── Stations ──────────────────────────────────────────────────────────────
  app.get('/operator/stations', async (req) => {
    const { companyId } = await companyFor(req);
    return { stations: await listStations({ companyId, includeUnapproved: true, limit: 500 }) };
  });

  app.get('/operator/stations/:id', async (req) => {
    const { station } = await stationOwned(req, (req.params as any).id);
    const s = await getStation(station.id);
    const chargePoints = await q('SELECT id, vendor, model, firmware, connected, last_heartbeat_at, last_boot_at FROM charge_points WHERE station_id = $1', [station.id]);
    return { station: s, chargePoints: chargePoints.map((c: any) => ({ ...c, connected: isChargePointConnected(c.id) })) };
  });

  app.post('/operator/stations', async (req) => {
    const { user, companyId } = await companyFor(req);
    const b = parse(stationSchema, req.body);
    const company = await one<any>('SELECT verification_status FROM companies WHERE id = $1', [companyId]);
    if (b.tariffId && !(await one('SELECT 1 FROM tariffs WHERE id = $1 AND company_id = $2', [b.tariffId, companyId]))) throw badRequest('Tariff not found');
    const station = await tx(async (c) => {
      const s = await one<any>(
        `INSERT INTO stations(company_id, tariff_id, name, description, address, city, region, country, postal_code, location, timezone, phone, is_24_7,
                              opening_hours, amenities, payment_methods, parking_info, access_type, reservations_enabled, reservation_fee, integration_type, listing_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ST_SetSRID(ST_MakePoint($11,$10),4326)::geography, $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
        [companyId, b.tariffId ?? null, b.name, b.description ?? null, b.address, b.city, b.region ?? null, b.country, b.postalCode ?? null, b.lat, b.lng,
         b.timezone, b.phone ?? null, b.is24_7, JSON.stringify(b.openingHours), b.amenities, b.paymentMethods, b.parkingInfo ?? null, b.accessType,
         b.reservationsEnabled, b.reservationFee, b.integrationType, company?.verification_status === 'verified' ? 'pending' : 'draft'], c,
      );
      for (const p of b.ports ?? []) await insertPort(c, s.id, p);
      return s;
    });
    await audit(user.id, 'station.create', 'station', station.id, { name: b.name });
    return { station: await getStation(station.id) };
  });

  app.patch('/operator/stations/:id', async (req) => {
    const { user, station } = await stationOwned(req, (req.params as any).id);
    const b = parse(stationSchema.omit({ ports: true }).partial(), req.body);
    const cur = await one<any>('SELECT *, ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM stations WHERE id = $1', [station.id]);
    if (b.tariffId && !(await one('SELECT 1 FROM tariffs WHERE id = $1 AND company_id = $2', [b.tariffId, cur.company_id]))) throw badRequest('Tariff not found');
    const moved = b.lat != null && b.lng != null && (Math.abs(b.lat - cur.lat) > 0.001 || Math.abs(b.lng - cur.lng) > 0.001);
    await q(
      `UPDATE stations SET tariff_id = $2, name = $3, description = $4, address = $5, city = $6, region = $7, country = $8, postal_code = $9,
              location = ST_SetSRID(ST_MakePoint($11,$10),4326)::geography, timezone = $12, phone = $13, is_24_7 = $14, opening_hours = $15,
              amenities = $16, payment_methods = $17, parking_info = $18, access_type = $19, reservations_enabled = $20, reservation_fee = $21,
              integration_type = $22, info_updated_at = now(), updated_at = now(),
              listing_status = CASE WHEN $23 AND listing_status = 'approved' THEN 'pending' ELSE listing_status END
        WHERE id = $1`,
      [station.id, b.tariffId !== undefined ? b.tariffId : cur.tariff_id, b.name ?? cur.name, b.description !== undefined ? b.description : cur.description,
       b.address ?? cur.address, b.city ?? cur.city, b.region !== undefined ? b.region : cur.region, b.country ?? cur.country,
       b.postalCode !== undefined ? b.postalCode : cur.postal_code, b.lat ?? cur.lat, b.lng ?? cur.lng, b.timezone ?? cur.timezone,
       b.phone !== undefined ? b.phone : cur.phone, b.is24_7 ?? cur.is_24_7, JSON.stringify(b.openingHours ?? cur.opening_hours), b.amenities ?? cur.amenities,
       b.paymentMethods ?? cur.payment_methods, b.parkingInfo !== undefined ? b.parkingInfo : cur.parking_info, b.accessType ?? cur.access_type,
       b.reservationsEnabled ?? cur.reservations_enabled, b.reservationFee ?? cur.reservation_fee, b.integrationType ?? cur.integration_type, moved],
    );
    await audit(user.id, 'station.update', 'station', station.id, { fields: Object.keys(b), relocated: moved });
    return { station: await getStation(station.id), reReviewRequired: moved };
  });

  app.delete('/operator/stations/:id', async (req) => {
    const { user, station } = await stationOwned(req, (req.params as any).id);
    const active = await one(`SELECT 1 FROM charging_sessions WHERE station_id = $1 AND status IN ('pending','active')`, [station.id]);
    if (active) throw conflict('Stop active charging sessions before deleting this station');
    await q('DELETE FROM stations WHERE id = $1', [station.id]);
    await audit(user.id, 'station.delete', 'station', station.id, { name: station.name });
    return { ok: true };
  });

  app.post('/operator/stations/:id/submit', async (req) => {
    const { user, station } = await stationOwned(req, (req.params as any).id);
    const co = await one<any>('SELECT c.verification_status FROM companies c JOIN stations s ON s.company_id = c.id WHERE s.id = $1', [station.id]);
    if (co.verification_status !== 'verified') throw conflict('Your company must be verified before listings can be published');
    const ports = await one<any>('SELECT COUNT(*)::int n FROM ports WHERE station_id = $1', [station.id]);
    if (!ports.n) throw badRequest('Add at least one charging port before submitting');
    await q(`UPDATE stations SET listing_status = 'pending', rejection_reason = NULL WHERE id = $1 AND listing_status IN ('draft','rejected')`, [station.id]);
    await audit(user.id, 'station.submit', 'station', station.id);
    return { station: await getStation(station.id) };
  });

  app.post('/operator/stations/:id/maintenance', async (req) => {
    const { user, station } = await stationOwned(req, (req.params as any).id);
    const b = parse(z.object({ enabled: z.boolean(), note: z.string().trim().max(300).optional() }), req.body);
    await q('UPDATE stations SET maintenance_mode = $2, maintenance_note = $3 WHERE id = $1', [station.id, b.enabled, b.enabled ? b.note ?? null : null]);
    if (b.enabled) {
      const ports = await q<{ id: string }>('SELECT id FROM ports WHERE station_id = $1', [station.id]);
      for (const p of ports) await setPortStatus(p.id, 'out_of_service', 'operator_reported');
      await notifyFavorites(station.id, 'station_outage', `${station.name} is under maintenance`, b.note ?? 'Chargers are temporarily unavailable.', {}, `maint:${station.id}:${new Date().toISOString().slice(0, 10)}`);
    } else {
      const ports = await q<{ id: string }>(`SELECT id FROM ports WHERE station_id = $1 AND status = 'out_of_service'`, [station.id]);
      for (const p of ports) await setPortStatus(p.id, 'available', 'operator_reported');
    }
    await audit(user.id, b.enabled ? 'station.maintenance_on' : 'station.maintenance_off', 'station', station.id, { note: b.note });
    return { station: await getStation(station.id) };
  });

  app.post('/operator/stations/:id/images', async (req) => {
    const { station } = await stationOwned(req, (req.params as any).id);
    const file = await req.file();
    if (!file) throw badRequest('Attach an image');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw badRequest('Upload a JPG, PNG or WebP image');
    const name = `${randomUUID()}${extname(file.filename) || '.jpg'}`;
    await mkdir(join(UPLOAD_DIR, 'stations'), { recursive: true });
    await pipeline(file.file, createWriteStream(join(UPLOAD_DIR, 'stations', name)));
    if (file.file.truncated) throw badRequest('Image too large (max 8 MB)');
    const url = `/api/uploads/stations/${name}`;
    await q('UPDATE stations SET images = array_append(images, $2), info_updated_at = now() WHERE id = $1', [station.id, url]);
    return { url };
  });

  app.delete('/operator/stations/:id/images', async (req) => {
    const { station } = await stationOwned(req, (req.params as any).id);
    const b = parse(z.object({ url: z.string() }), req.body);
    await q('UPDATE stations SET images = array_remove(images, $2) WHERE id = $1', [station.id, b.url]);
    return { ok: true };
  });

  // ── Ports ─────────────────────────────────────────────────────────────────
  app.get('/operator/ports', async (req) => {
    const { companyId } = await companyFor(req);
    const ports = await q(
      `SELECT p.*, s.name station_name, s.city, s.integration_type,
              (SELECT COUNT(*)::int FROM charging_sessions cs WHERE cs.port_id = p.id AND cs.started_at > now() - interval '30 days') sessions_30d
         FROM ports p JOIN stations s ON s.id = p.station_id WHERE s.company_id = $1 ORDER BY s.name, p.label`,
      [companyId],
    );
    return { ports };
  });

  app.post('/operator/stations/:id/ports', async (req) => {
    const { user, station } = await stationOwned(req, (req.params as any).id);
    const b = parse(portSchema, req.body);
    const port = await tx((c) => insertPort(c, station.id, b));
    await audit(user.id, 'port.create', 'port', port.id, { station: station.id });
    return { port };
  });

  app.patch('/operator/ports/:id', async (req) => {
    const { user, port } = await portOwned(req, (req.params as any).id);
    const b = parse(portSchema.partial().extend({ isActive: z.boolean().optional() }), req.body);
    const connector = b.connectorType ?? port.connector_type;
    const updated = await one(
      `UPDATE ports SET label = $2, evse_uid = $3, connector_type = $4, current_type = $5, max_power_kw = $6, voltage = $7, amperage = $8,
              power_group = $9, ocpp_connector_id = $10, tariff_id = $11, is_active = $12 WHERE id = $1 RETURNING *`,
      [port.id, b.label ?? port.label, b.evseUid !== undefined ? b.evseUid : port.evse_uid, connector, CONNECTOR_CURRENT[connector as keyof typeof CONNECTOR_CURRENT],
       b.maxPowerKw ?? port.max_power_kw, b.voltage !== undefined ? b.voltage : port.voltage, b.amperage !== undefined ? b.amperage : port.amperage,
       b.powerGroup !== undefined ? b.powerGroup : port.power_group, b.ocppConnectorId !== undefined ? b.ocppConnectorId : port.ocpp_connector_id,
       b.tariffId !== undefined ? b.tariffId : port.tariff_id, b.isActive ?? port.is_active],
    );
    await q('UPDATE stations SET info_updated_at = now() WHERE id = $1', [port.station_id]);
    await audit(user.id, 'port.update', 'port', port.id, b);
    return { port: updated };
  });

  app.delete('/operator/ports/:id', async (req) => {
    const { user, port } = await portOwned(req, (req.params as any).id);
    if (await one(`SELECT 1 FROM charging_sessions WHERE port_id = $1 AND status IN ('pending','active')`, [port.id])) throw conflict('Port has an active session');
    await q('DELETE FROM ports WHERE id = $1', [port.id]);
    await audit(user.id, 'port.delete', 'port', port.id);
    return { ok: true };
  });

  app.post('/operator/ports/:id/status', async (req) => {
    const { user, port } = await portOwned(req, (req.params as any).id);
    const b = parse(z.object({ status: z.enum(PORT_STATUSES) }), req.body);
    if (port.integration_type === 'ocpp' && b.status !== 'out_of_service')
      throw conflict('This port reports live status over OCPP; you can only take it out of service manually');
    await setPortStatus(port.id, b.status as PortStatus, 'operator_reported');
    await audit(user.id, 'port.status', 'port', port.id, { status: b.status });
    return { ok: true };
  });

  // ── Tariffs ───────────────────────────────────────────────────────────────
  const tariffConfig = z.object({
    currency: z.string().length(3),
    baseRate: z.number().min(0),
    weekendRate: z.number().min(0).nullable().optional(),
    weekendDays: z.array(z.number().int().min(0).max(6)).optional(),
    periods: z.array(z.object({ label: z.string().min(1).max(40), kind: z.enum(['peak', 'off_peak', 'shoulder', 'super_off_peak']), days: z.array(z.number().int().min(0).max(6)).optional(), start: zTime, end: zTime, rate: z.number().min(0) })).max(12).default([]),
    seasonal: z.array(z.object({ label: z.string().min(1).max(40), startMonth: z.number().int().min(1).max(12), endMonth: z.number().int().min(1).max(12), multiplier: z.number().min(0.1).max(5) })).max(6).default([]),
    discounts: z.array(z.object({ label: z.string().min(1).max(40), percent: z.number().min(0).max(90), days: z.array(z.number().int()).optional(), start: zTime.optional(), end: zTime.optional(), validFrom: z.string().optional(), validTo: z.string().optional() })).max(10).default([]),
    dynamic: z.object({ enabled: z.boolean(), minMultiplier: z.number().min(0.5).max(1), maxMultiplier: z.number().min(1).max(3) }).default({ enabled: false, minMultiplier: 0.9, maxMultiplier: 1.2 }),
    sessionFee: z.number().min(0).default(0),
    timeFeePerMinute: z.number().min(0).default(0),
    parkingFeePerHour: z.number().min(0).default(0),
    idleFeePerMinute: z.number().min(0).default(0),
    idleGraceMinutes: z.number().int().min(0).max(120).default(10),
    serviceChargePercent: z.number().min(0).max(50).default(0),
    taxPercent: z.number().min(0).max(50).default(0),
  });

  app.get('/operator/tariffs', async (req) => {
    const { companyId } = await companyFor(req);
    return {
      tariffs: await q(
        `SELECT t.*, (SELECT COUNT(*)::int FROM stations s WHERE s.tariff_id = t.id) stations FROM tariffs t WHERE company_id = $1 ORDER BY created_at`,
        [companyId],
      ),
    };
  });

  app.post('/operator/tariffs', async (req) => {
    const { user, companyId } = await companyFor(req);
    const b = parse(z.object({ name: z.string().trim().min(2).max(60), config: tariffConfig }), req.body);
    const t = await one<any>('INSERT INTO tariffs(company_id, name, config) VALUES ($1,$2,$3) RETURNING *', [companyId, b.name, b.config]);
    await audit(user.id, 'tariff.create', 'tariff', t.id, { name: b.name });
    return { tariff: t };
  });

  app.patch('/operator/tariffs/:id', async (req) => {
    const user = requireRole(req, 'operator', 'admin');
    const t = await one<any>('SELECT * FROM tariffs WHERE id = $1', [(req.params as any).id]);
    if (!t) throw notFound('Tariff not found');
    assertCompanyAccess(user, t.company_id);
    const b = parse(z.object({ name: z.string().trim().min(2).max(60).optional(), config: tariffConfig.optional() }), req.body);
    const updated = await one<any>('UPDATE tariffs SET name = COALESCE($2,name), config = COALESCE($3,config), updated_at = now() WHERE id = $1 RETURNING *',
      [t.id, b.name ?? null, b.config ?? null]);
    if (b.config && (b.config.baseRate !== t.config.baseRate || JSON.stringify(b.config.periods) !== JSON.stringify(t.config.periods))) {
      const stations = await q<any>('SELECT id, name FROM stations WHERE tariff_id = $1 AND listing_status = $2', [t.id, 'approved']);
      const dir = b.config.baseRate > t.config.baseRate ? 'increased' : b.config.baseRate < t.config.baseRate ? 'decreased' : 'changed';
      for (const s of stations)
        await notifyFavorites(s.id, 'price_change', `Price ${dir} at ${s.name}`,
          `Standard rate is now ${b.config.currency} ${b.config.baseRate}/kWh (was ${t.config.baseRate}).`, { tariffId: t.id }, `price:${s.id}:${updated.updated_at}`);
    }
    await audit(user.id, 'tariff.update', 'tariff', t.id, { name: b.name });
    return { tariff: updated };
  });

  app.delete('/operator/tariffs/:id', async (req) => {
    const user = requireRole(req, 'operator', 'admin');
    const t = await one<any>('SELECT * FROM tariffs WHERE id = $1', [(req.params as any).id]);
    if (!t) throw notFound();
    assertCompanyAccess(user, t.company_id);
    const used = await one<any>('SELECT COUNT(*)::int n FROM stations WHERE tariff_id = $1', [t.id]);
    if (used.n) throw conflict(`This tariff is used by ${used.n} station(s). Assign another tariff first.`);
    await q('DELETE FROM tariffs WHERE id = $1', [t.id]);
    return { ok: true };
  });

  // ── OCPP charge points ────────────────────────────────────────────────────
  app.post('/operator/stations/:id/charge-points', async (req) => {
    const { user, station } = await stationOwned(req, (req.params as any).id);
    const b = parse(z.object({ identity: z.string().regex(/^[A-Za-z0-9_.-]{3,48}$/, 'Use 3–48 letters, digits, . _ -'), password: z.string().min(12).max(64).optional() }), req.body);
    if (await one('SELECT 1 FROM charge_points WHERE id = $1', [b.identity])) throw conflict('Charge point identity already registered');
    await q('INSERT INTO charge_points(id, station_id, password_hash) VALUES ($1,$2,$3)', [b.identity, station.id, b.password ? await bcrypt.hash(b.password, 10) : null]);
    await audit(user.id, 'chargepoint.create', 'charge_point', b.identity, { station: station.id });
    const wsBase = config.publicApiUrl.replace(/^http/, 'ws').replace(/:3000$/, ':4000');
    return { chargePoint: { id: b.identity, url: `${wsBase}/ocpp/${b.identity}`, protocol: 'ocpp1.6', basicAuth: !!b.password } };
  });
  app.delete('/operator/charge-points/:id', async (req) => {
    const user = requireRole(req, 'operator', 'admin');
    const cp = await one<any>('SELECT cp.id, s.company_id FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.id = $1', [(req.params as any).id]);
    if (!cp) throw notFound();
    assertCompanyAccess(user, cp.company_id);
    await q('DELETE FROM charge_points WHERE id = $1', [cp.id]);
    return { ok: true };
  });

  // ── Reservations / reviews / complaints ───────────────────────────────────
  app.get('/operator/reservations', async (req) => {
    const { companyId } = await companyFor(req);
    const status = (req.query as any).status as string | undefined;
    return {
      reservations: await q(
        `SELECT r.*, s.name station_name, p.label port_label, p.connector_type, u.full_name driver_name
           FROM reservations r JOIN stations s ON s.id = r.station_id JOIN ports p ON p.id = r.port_id JOIN users u ON u.id = r.user_id
          WHERE s.company_id = $1 ${status ? 'AND r.status = $2' : ''} ORDER BY r.start_at DESC LIMIT 300`,
        status ? [companyId, status] : [companyId],
      ),
    };
  });

  app.get('/operator/reviews', async (req) => {
    const { companyId } = await companyFor(req);
    return {
      reviews: await q(
        `SELECT r.*, s.name station_name, u.full_name author FROM reviews r JOIN stations s ON s.id = r.station_id JOIN users u ON u.id = r.user_id
          WHERE s.company_id = $1 ORDER BY r.created_at DESC LIMIT 300`,
        [companyId],
      ),
    };
  });

  app.post('/operator/reviews/:id/reply', async (req) => {
    const user = requireRole(req, 'operator', 'admin');
    const r = await one<any>('SELECT r.id, s.company_id FROM reviews r JOIN stations s ON s.id = r.station_id WHERE r.id = $1', [(req.params as any).id]);
    if (!r) throw notFound();
    assertCompanyAccess(user, r.company_id);
    const b = parse(z.object({ reply: z.string().trim().min(2).max(1000) }), req.body);
    await q('UPDATE reviews SET operator_reply = $2, operator_replied_at = now() WHERE id = $1', [r.id, b.reply]);
    return { ok: true };
  });

  app.get('/operator/complaints', async (req) => {
    const { companyId } = await companyFor(req);
    return { complaints: await q('SELECT c.*, s.name station_name FROM complaints c LEFT JOIN stations s ON s.id = c.station_id WHERE c.company_id = $1 ORDER BY c.created_at DESC', [companyId]) };
  });

  // ── Analytics ─────────────────────────────────────────────────────────────
  app.get('/operator/analytics', async (req) => {
    const { companyId } = await companyFor(req);
    const qy = parse(z.object({ from: z.string().optional(), to: z.string().optional(), stationId: z.string().uuid().optional() }), req.query);
    const to = qy.to ? new Date(qy.to) : new Date();
    const from = qy.from ? new Date(qy.from) : new Date(to.getTime() - 30 * 86400_000);
    if (!(from < to)) throw badRequest('"from" must be before "to"');
    if (to.getTime() - from.getTime() > 400 * 86400_000) throw badRequest('Choose a range up to 400 days');
    return analytics({ companyId, from, to, stationId: qy.stationId });
  });
}

async function insertPort(c: any, stationId: string, p: z.infer<typeof portSchema>) {
  const r = await c.query(
    `INSERT INTO ports(station_id, label, evse_uid, connector_type, current_type, max_power_kw, voltage, amperage, power_group, ocpp_connector_id, tariff_id,
                       status, status_source, status_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'unknown','operator_reported', now()) RETURNING *`,
    [stationId, p.label, p.evseUid ?? null, p.connectorType, CONNECTOR_CURRENT[p.connectorType], p.maxPowerKw, p.voltage ?? null, p.amperage ?? null,
     p.powerGroup ?? null, p.ocppConnectorId ?? null, p.tariffId ?? null],
  );
  return r.rows[0];
}

/** Shared analytics query used by operator (company-scoped) and admin (platform-wide) dashboards. */
export async function analytics(opts: { companyId?: string | null; from: Date; to: Date; stationId?: string }) {
  const params: unknown[] = [opts.from, opts.to];
  const scope: string[] = [];
  if (opts.companyId) { params.push(opts.companyId); scope.push(`s.company_id = $${params.length}`); }
  if (opts.stationId) { params.push(opts.stationId); scope.push(`s.id = $${params.length}`); }
  const where = scope.length ? `AND ${scope.join(' AND ')}` : '';
  const sessWhere = `cs.started_at >= $1 AND cs.started_at < $2 AND cs.status IN ('completed','stopped') ${where}`;
  const tz = opts.companyId ? (await one<any>(`SELECT timezone FROM stations WHERE company_id = $1 LIMIT 1`, [opts.companyId]))?.timezone ?? 'UTC' : 'UTC';

  const totals = await one<any>(
    `SELECT COUNT(*)::int sessions, COALESCE(SUM(cs.energy_kwh),0)::float energy_kwh, COALESCE(AVG(EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at))/60),0)::float avg_duration_min,
            COALESCE(AVG(cs.energy_kwh),0)::float avg_energy_kwh, COUNT(DISTINCT cs.user_id)::int unique_drivers
       FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id WHERE ${sessWhere}`, params);
  const revenue = await q<any>(
    `SELECT cs.currency, COALESCE(SUM(cs.cost_total),0)::float total FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id WHERE ${sessWhere} GROUP BY cs.currency ORDER BY total DESC`, params);
  const daily = await q<any>(
    `SELECT to_char(date_trunc('day', cs.started_at AT TIME ZONE '${tz}'), 'YYYY-MM-DD') AS day, COUNT(*)::int sessions,
            SUM(cs.energy_kwh)::float energy_kwh, SUM(cs.cost_total)::float revenue, AVG(EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at))/60)::float avg_duration_min
       FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id WHERE ${sessWhere} GROUP BY 1 ORDER BY 1`, params);
  const hourly = await q<any>(
    `SELECT EXTRACT(DOW FROM cs.started_at AT TIME ZONE '${tz}')::int AS dow, EXTRACT(HOUR FROM cs.started_at AT TIME ZONE '${tz}')::int AS hour, COUNT(*)::int sessions
       FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id WHERE ${sessWhere} GROUP BY 1, 2`, params);
  const rangeMin = (opts.to.getTime() - opts.from.getTime()) / 60000;
  const byStation = await q<any>(
    `SELECT s.id, s.name, s.city, COUNT(cs.id)::int sessions, COALESCE(SUM(cs.energy_kwh),0)::float energy_kwh, COALESCE(SUM(cs.cost_total),0)::float revenue,
            (SELECT COUNT(*)::int FROM ports p WHERE p.station_id = s.id AND p.is_active) ports,
            COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(cs.ended_at, $2) - GREATEST(cs.started_at, $1)))/60),0)::float busy_min,
            (SELECT ROUND(AVG(rating)::numeric,2)::float FROM reviews r WHERE r.station_id = s.id AND r.status = 'visible') rating
       FROM stations s LEFT JOIN charging_sessions cs ON cs.station_id = s.id AND cs.started_at >= $1 AND cs.started_at < $2 AND cs.status IN ('completed','stopped')
      WHERE s.listing_status = 'approved' ${where} GROUP BY s.id ORDER BY sessions DESC`, params);
  const stations = byStation.map((s) => ({ ...s, utilization: s.ports ? Math.min(1, s.busy_min / (s.ports * rangeMin)) : 0 }));
  const portStats = await q<any>(
    `WITH ev AS (
       SELECT e.status, GREATEST(e.created_at, $1) AS s_at,
              LEAST(COALESCE(LEAD(e.created_at) OVER (PARTITION BY e.port_id ORDER BY e.created_at), now()), $2) AS e_at
         FROM port_status_events e JOIN stations s ON s.id = e.station_id WHERE e.created_at < $2 ${where})
     SELECT status, SUM(EXTRACT(EPOCH FROM (e_at - s_at))/60)::float minutes FROM ev WHERE e_at > s_at GROUP BY status`, params);
  const byConnector = await q<any>(
    `SELECT p.connector_type, COUNT(*)::int sessions, SUM(cs.energy_kwh)::float energy_kwh FROM charging_sessions cs JOIN ports p ON p.id = cs.port_id
       JOIN stations s ON s.id = cs.station_id WHERE ${sessWhere} GROUP BY 1 ORDER BY 2 DESC`, params);
  const ratings = await one<any>(
    `SELECT ROUND(AVG(r.rating)::numeric,2)::float avg, COUNT(*)::int count FROM reviews r JOIN stations s ON s.id = r.station_id
      WHERE r.status = 'visible' AND r.created_at < $2 AND $1::timestamptz IS NOT NULL ${where}`, params);
  const totalBusy = stations.reduce((a, s) => a + s.busy_min, 0);
  const totalPorts = stations.reduce((a, s) => a + s.ports, 0);
  return {
    range: { from: opts.from.toISOString(), to: opts.to.toISOString(), timezone: tz },
    totals: { ...totals, revenue, utilization: totalPorts ? Math.min(1, totalBusy / (totalPorts * rangeMin)) : 0 },
    daily, hourly, stations, portStats, byConnector, ratings,
  };
}

