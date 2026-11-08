import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { q, one } from '../db';
import { requireRole } from '../lib/auth';
import { audit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { allHealth } from '../integrations/health';
import { routingChainNames } from '../integrations/maps';
import { connectedChargePoints } from '../integrations/charging/ocpp16';
import { activeSimulatedSessions } from '../integrations/charging/simulator';
import { paymentProvider } from '../integrations/payments';
import { syncOcpi } from '../integrations/ocpi/client';
import { connectedClients } from '../realtime/hub';
import { notify } from '../services/notifications';
import { analytics } from './operator';

export const DEFAULT_SETTINGS: Record<string, any> = {
  platform: { name: 'Voltway', supportEmail: 'support@voltway.example', defaultCity: 'Lahore', maintenanceBanner: '' },
  pricing_rules: { platformFeePercent: 0, maxPricePerKwh: { PKR: 250, AED: 3 }, requireTimeOfUseDisclosure: true },
  notifications: { reservationReminderMinutes: 15, peakWarningMinutes: 30 },
  demo: { showDemoBanner: true },
};

export async function getSetting<T = any>(key: string): Promise<T> {
  const r = await one<any>('SELECT value FROM platform_settings WHERE key = $1', [key]);
  return { ...(DEFAULT_SETTINGS[key] ?? {}), ...(r?.value ?? {}) };
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/admin')) requireRole(req, 'admin');
  });

  app.get('/admin/overview', async () => {
    const users = await q<any>(`SELECT role, COUNT(*)::int n FROM users GROUP BY role`);
    const companies = await q<any>(`SELECT verification_status status, COUNT(*)::int n FROM companies GROUP BY 1`);
    const stations = await q<any>(`SELECT listing_status status, COUNT(*)::int n FROM stations GROUP BY 1`);
    const ports = await one<any>(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status = 'available')::int available,
                                     COUNT(*) FILTER (WHERE status IN ('out_of_service','offline','no_power'))::int down FROM ports p JOIN stations s ON s.id = p.station_id WHERE s.listing_status = 'approved'`);
    const signups = await q<any>(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int n FROM users WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`);
    const open = await one<any>(`SELECT (SELECT COUNT(*)::int FROM complaints WHERE status IN ('open','in_progress')) complaints,
                                        (SELECT COUNT(*)::int FROM reviews WHERE status = 'flagged') flagged_reviews,
                                        (SELECT COUNT(*)::int FROM station_reports WHERE NOT resolved) station_reports,
                                        (SELECT COUNT(*)::int FROM companies WHERE verification_status = 'pending') pending_companies,
                                        (SELECT COUNT(*)::int FROM stations WHERE listing_status = 'pending') pending_stations`);
    const a = await analytics({ from: new Date(Date.now() - 30 * 86400_000), to: new Date() });
    return { users, companies, stations, ports, signups, queues: open, analytics: { totals: a.totals, daily: a.daily, byConnector: a.byConnector, topStations: a.stations.slice(0, 8) } };
  });

  app.get('/admin/analytics', async (req) => {
    const qy = parse(z.object({ from: z.string().optional(), to: z.string().optional(), companyId: z.string().uuid().optional() }), req.query);
    const to = qy.to ? new Date(qy.to) : new Date();
    const from = qy.from ? new Date(qy.from) : new Date(to.getTime() - 30 * 86400_000);
    return analytics({ companyId: qy.companyId ?? null, from, to });
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  app.get('/admin/users', async (req) => {
    const qy = parse(z.object({ q: z.string().optional(), role: z.enum(['driver', 'operator', 'admin']).optional(), status: z.enum(['active', 'suspended']).optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (qy.q) { params.push(`%${qy.q}%`); where.push(`(u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`); }
    if (qy.role) { params.push(qy.role); where.push(`u.role = $${params.length}`); }
    if (qy.status) { params.push(qy.status); where.push(`u.status = $${params.length}`); }
    const users = await q(
      `SELECT u.id, u.email, u.phone, u.full_name, u.role, u.status, u.auth_provider, u.created_at, u.last_login_at,
              (SELECT COUNT(*)::int FROM charging_sessions cs WHERE cs.user_id = u.id) sessions,
              (SELECT string_agg(c.name, ', ') FROM company_members cm JOIN companies c ON c.id = cm.company_id WHERE cm.user_id = u.id) companies
         FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.created_at DESC LIMIT 300`,
      params,
    );
    return { users };
  });

  app.patch('/admin/users/:id', async (req) => {
    const admin = requireRole(req, 'admin');
    const { id } = req.params as any;
    const b = parse(z.object({ role: z.enum(['driver', 'operator', 'admin']).optional(), status: z.enum(['active', 'suspended']).optional() }), req.body);
    if (id === admin.id && (b.status === 'suspended' || (b.role && b.role !== 'admin'))) throw badRequest('You cannot demote or suspend yourself');
    const u = await one('UPDATE users SET role = COALESCE($2, role), status = COALESCE($3, status) WHERE id = $1 RETURNING id, role, status', [id, b.role ?? null, b.status ?? null]);
    if (!u) throw notFound();
    await audit(admin.id, 'user.update', 'user', id, b);
    return { user: u };
  });

  // ── Companies ─────────────────────────────────────────────────────────────
  app.get('/admin/companies', async (req) => {
    const status = (req.query as any).status as string | undefined;
    return {
      companies: await q(
        `SELECT c.*, (SELECT COUNT(*)::int FROM stations s WHERE s.company_id = c.id) stations,
                (SELECT COUNT(*)::int FROM stations s WHERE s.company_id = c.id AND s.listing_status = 'pending') pending_stations,
                (SELECT u.email FROM users u WHERE u.id = c.created_by) owner_email
           FROM companies c ${status ? 'WHERE c.verification_status = $1' : ''} ORDER BY (c.verification_status = 'pending') DESC, c.created_at DESC`,
        status ? [status] : [],
      ),
    };
  });

  app.post('/admin/companies/:id/verify', async (req) => {
    const admin = requireRole(req, 'admin');
    const b = parse(z.object({ decision: z.enum(['verified', 'rejected', 'suspended', 'pending']), notes: z.string().trim().max(1000).optional() }), req.body);
    const co = await one<any>(
      `UPDATE companies SET verification_status = $2, verification_notes = $3, verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE verified_at END,
              verified_by = CASE WHEN $2 = 'verified' THEN $4::uuid ELSE verified_by END WHERE id = $1 RETURNING *`,
      [(req.params as any).id, b.decision, b.notes ?? null, admin.id],
    );
    if (!co) throw notFound();
    if (b.decision === 'verified') await q(`UPDATE stations SET listing_status = 'pending' WHERE company_id = $1 AND listing_status = 'draft'`, [co.id]);
    if (b.decision === 'suspended') await q(`UPDATE stations SET listing_status = 'suspended' WHERE company_id = $1 AND listing_status = 'approved'`, [co.id]);
    const owners = await q<any>('SELECT user_id FROM company_members WHERE company_id = $1', [co.id]);
    for (const o of owners)
      await notify(o.user_id, 'system', `Company ${b.decision === 'verified' ? 'verified' : b.decision}`,
        b.decision === 'verified' ? `${co.name} is verified. Your station listings have been submitted for review.` : `${co.name}: ${b.notes ?? 'Please contact support for details.'}`);
    await audit(admin.id, `company.${b.decision}`, 'company', co.id, { notes: b.notes });
    return { company: co };
  });

  // ── Station listings ──────────────────────────────────────────────────────
  app.get('/admin/stations', async (req) => {
    const qy = parse(z.object({ status: z.string().optional(), q: z.string().optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (qy.status) { params.push(qy.status); where.push(`s.listing_status = $${params.length}`); }
    if (qy.q) { params.push(`%${qy.q}%`); where.push(`(s.name ILIKE $${params.length} OR s.city ILIKE $${params.length} OR c.name ILIKE $${params.length})`); }
    return {
      stations: await q(
        `SELECT s.id, s.name, s.city, s.address, s.listing_status, s.rejection_reason, s.created_at, s.info_updated_at, s.integration_type, s.is_demo,
                ST_Y(s.location::geometry) lat, ST_X(s.location::geometry) lng, c.name company_name, c.verification_status company_status,
                (SELECT COUNT(*)::int FROM ports p WHERE p.station_id = s.id) ports, cardinality(s.images) images, s.tariff_id IS NOT NULL has_tariff
           FROM stations s JOIN companies c ON c.id = s.company_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY (s.listing_status = 'pending') DESC, s.created_at DESC LIMIT 500`,
        params,
      ),
    };
  });

  app.post('/admin/stations/:id/review', async (req) => {
    const admin = requireRole(req, 'admin');
    const b = parse(z.object({ decision: z.enum(['approved', 'rejected', 'suspended']), reason: z.string().trim().max(500).optional() }), req.body);
    if (b.decision !== 'approved' && !b.reason) throw badRequest('Give a reason so the operator can fix the listing');
    const s = await one<any>('UPDATE stations SET listing_status = $2, rejection_reason = $3 WHERE id = $1 RETURNING id, name, company_id', [(req.params as any).id, b.decision, b.decision === 'approved' ? null : b.reason]);
    if (!s) throw notFound();
    const owners = await q<any>('SELECT user_id FROM company_members WHERE company_id = $1', [s.company_id]);
    for (const o of owners) await notify(o.user_id, 'system', `Listing ${b.decision}: ${s.name}`, b.reason ?? 'Your station is now visible to drivers.', { stationId: s.id });
    await audit(admin.id, `station.${b.decision}`, 'station', s.id, { reason: b.reason });
    return { ok: true };
  });

  app.get('/admin/data-quality', async () => {
    const rows = await q<any>(
      `SELECT s.id, s.name, s.city, c.name company_name, s.integration_type, s.is_24_7, jsonb_array_length(s.opening_hours) hours, cardinality(s.images) images,
              s.tariff_id IS NOT NULL has_tariff, s.info_updated_at, s.description IS NOT NULL AND length(s.description) > 20 has_description,
              (SELECT COUNT(*)::int FROM ports p WHERE p.station_id = s.id) ports,
              (SELECT COUNT(*)::int FROM ports p WHERE p.station_id = s.id AND p.status = 'unknown') unknown_ports,
              (SELECT MAX(status_updated_at) FROM ports p WHERE p.station_id = s.id) last_status,
              (SELECT COUNT(*)::int FROM station_reports r WHERE r.station_id = s.id AND NOT r.resolved) open_reports
         FROM stations s JOIN companies c ON c.id = s.company_id WHERE s.listing_status = 'approved'`,
    );
    const now = Date.now();
    const out = rows.map((r) => {
      const issues: string[] = [];
      if (!r.ports) issues.push('No ports');
      if (!r.has_tariff) issues.push('No pricing');
      if (!r.is_24_7 && !r.hours) issues.push('No opening hours');
      if (!r.images) issues.push('No photos');
      if (!r.has_description) issues.push('No description');
      if (r.unknown_ports) issues.push(`${r.unknown_ports} port(s) with unknown status`);
      const statusAgeH = r.last_status ? (now - new Date(r.last_status).getTime()) / 3600_000 : Infinity;
      if (r.integration_type === 'none' && statusAgeH > 24) issues.push('Status not updated in 24 h');
      if ((now - new Date(r.info_updated_at).getTime()) / 86400_000 > 180) issues.push('Listing info older than 6 months');
      if (r.open_reports) issues.push(`${r.open_reports} open driver report(s)`);
      const score = Math.max(0, 100 - issues.length * 14 - (r.open_reports > 2 ? 10 : 0));
      return { ...r, issues, score };
    });
    out.sort((a, b) => a.score - b.score);
    return { stations: out, averageScore: out.length ? Math.round(out.reduce((a, s) => a + s.score, 0) / out.length) : 100 };
  });

  app.get('/admin/station-reports', async () => ({
    reports: await q(
      `SELECT r.*, s.name station_name, p.label port_label, u.full_name reporter FROM station_reports r JOIN stations s ON s.id = r.station_id
         LEFT JOIN ports p ON p.id = r.port_id JOIN users u ON u.id = r.user_id ORDER BY r.resolved, r.created_at DESC LIMIT 300`,
    ),
  }));
  app.post('/admin/station-reports/:id/resolve', async (req) => {
    const admin = requireRole(req, 'admin');
    await q('UPDATE station_reports SET resolved = true WHERE id = $1', [(req.params as any).id]);
    await audit(admin.id, 'station_report.resolve', 'station_report', (req.params as any).id);
    return { ok: true };
  });

  // ── Reviews moderation ────────────────────────────────────────────────────
  app.get('/admin/reviews', async (req) => {
    const status = (req.query as any).status as string | undefined;
    return {
      reviews: await q(
        `SELECT r.*, s.name station_name, u.full_name author, u.email author_email,
                (SELECT json_agg(json_build_object('reason', rr.reason, 'at', rr.created_at)) FROM review_reports rr WHERE rr.review_id = r.id AND NOT rr.resolved) reports
           FROM reviews r JOIN stations s ON s.id = r.station_id JOIN users u ON u.id = r.user_id
          ${status ? 'WHERE r.status = $1' : ''} ORDER BY (r.status = 'flagged') DESC, r.created_at DESC LIMIT 300`,
        status ? [status] : [],
      ),
    };
  });
  app.post('/admin/reviews/:id/moderate', async (req) => {
    const admin = requireRole(req, 'admin');
    const b = parse(z.object({ status: z.enum(['visible', 'hidden']) }), req.body);
    await q('UPDATE reviews SET status = $2 WHERE id = $1', [(req.params as any).id, b.status]);
    await q('UPDATE review_reports SET resolved = true WHERE review_id = $1', [(req.params as any).id]);
    await audit(admin.id, `review.${b.status}`, 'review', (req.params as any).id);
    return { ok: true };
  });

  // ── Complaints ────────────────────────────────────────────────────────────
  app.get('/admin/complaints', async (req) => {
    const status = (req.query as any).status as string | undefined;
    return {
      complaints: await q(
        `SELECT c.*, u.full_name user_name, u.email user_email, s.name station_name, co.name company_name
           FROM complaints c LEFT JOIN users u ON u.id = c.user_id LEFT JOIN stations s ON s.id = c.station_id LEFT JOIN companies co ON co.id = c.company_id
          ${status ? 'WHERE c.status = $1' : ''} ORDER BY CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, c.created_at DESC LIMIT 300`,
        status ? [status] : [],
      ),
    };
  });
  app.patch('/admin/complaints/:id', async (req) => {
    const admin = requireRole(req, 'admin');
    const b = parse(z.object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(), adminNotes: z.string().max(3000).optional() }), req.body);
    const c = await one<any>(
      `UPDATE complaints SET status = COALESCE($2,status), priority = COALESCE($3,priority), admin_notes = COALESCE($4,admin_notes), updated_at = now() WHERE id = $1 RETURNING *`,
      [(req.params as any).id, b.status ?? null, b.priority ?? null, b.adminNotes ?? null],
    );
    if (!c) throw notFound();
    if (b.status && c.user_id) await notify(c.user_id, 'system', `Your ticket is ${b.status.replace('_', ' ')}`, c.subject, { complaintId: c.id });
    await audit(admin.id, 'complaint.update', 'complaint', c.id, b);
    return { complaint: c };
  });

  // ── Settings & pricing rules ──────────────────────────────────────────────
  app.get('/admin/settings', async () => {
    const out: Record<string, any> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = await getSetting(key);
    return { settings: out };
  });
  app.put('/admin/settings/:key', async (req) => {
    const admin = requireRole(req, 'admin');
    const key = (req.params as any).key as string;
    if (!(key in DEFAULT_SETTINGS)) throw badRequest('Unknown setting');
    const value = parse(z.record(z.string(), z.any()), req.body);
    await q(`INSERT INTO platform_settings(key, value, updated_by) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now(), updated_by = $3`, [key, value, admin.id]);
    await audit(admin.id, 'settings.update', 'setting', key, value);
    return { key, value: await getSetting(key) };
  });

  // ── Integrations ──────────────────────────────────────────────────────────
  app.get('/admin/integrations', async () => {
    const chargePoints = await q<any>(`SELECT cp.id, cp.vendor, cp.model, cp.last_heartbeat_at, s.name station_name FROM charge_points cp JOIN stations s ON s.id = cp.station_id ORDER BY cp.id`);
    const connected = new Set(connectedChargePoints());
    const pay = paymentProvider();
    return {
      maps: {
        routingChain: routingChainNames(),
        mapboxConfigured: !!config.mapboxToken,
        osrmUrl: config.osrmUrl,
        geocoder: config.geocoder,
        trafficSource: config.mapboxToken ? 'Mapbox driving-traffic (live)' : 'Typical-pattern model (estimated)',
      },
      auth: { google: !!config.google.clientId, apple: !!config.apple.clientId },
      payments: { provider: pay.name, demo: pay.isDemo },
      ocpp: { endpoint: '/ocpp/{chargePointId}', protocol: 'ocpp1.6', chargePoints: chargePoints.map((c) => ({ ...c, connected: connected.has(c.id) })) },
      simulator: { enabled: config.demoSimulator, activeSessions: activeSimulatedSessions(), speed: config.demoSessionSpeed },
      realtime: { connectedClients: connectedClients() },
      health: allHealth(),
      integrations: await q(`SELECT i.id, i.kind, i.name, i.enabled, i.last_sync_at, i.status_message, i.company_id, c.name company_name,
                                    (i.config - 'token') AS config FROM integrations i LEFT JOIN companies c ON c.id = i.company_id ORDER BY i.created_at`),
    };
  });

  app.post('/admin/integrations', async (req) => {
    const admin = requireRole(req, 'admin');
    const b = parse(z.object({ kind: z.enum(['ocpi', 'operator_api']), name: z.string().min(2).max(60), companyId: z.string().uuid(), config: z.object({ locationsUrl: z.string().url(), token: z.string().min(4) }), enabled: z.boolean().default(true) }), req.body);
    const i = await one<any>('INSERT INTO integrations(kind, name, company_id, config, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING id, kind, name, enabled', [b.kind, b.name, b.companyId, b.config, b.enabled]);
    await audit(admin.id, 'integration.create', 'integration', i.id, { name: b.name, kind: b.kind });
    return { integration: i };
  });
  app.post('/admin/integrations/:id/sync', async (req) => {
    requireRole(req, 'admin');
    try {
      return await syncOcpi((req.params as any).id);
    } catch (e) {
      throw badRequest(`Sync failed: ${(e as Error).message}`);
    }
  });
  app.delete('/admin/integrations/:id', async (req) => {
    const admin = requireRole(req, 'admin');
    await q('DELETE FROM integrations WHERE id = $1', [(req.params as any).id]);
    await audit(admin.id, 'integration.delete', 'integration', (req.params as any).id);
    return { ok: true };
  });

  app.get('/admin/audit-log', async () => ({
    entries: await q(`SELECT a.*, u.full_name actor_name, u.email actor_email FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200`),
  }));
}

// Public, non-sensitive subset of platform settings
export async function publicSettingsRoutes(app: FastifyInstance) {
  app.get('/platform', async () => {
    const platform = await getSetting('platform');
    const demo = await getSetting('demo');
    const demoStations = await one<any>('SELECT COUNT(*)::int n FROM stations WHERE is_demo');
    return {
      name: platform.name, supportEmail: platform.supportEmail, defaultCity: platform.defaultCity, maintenanceBanner: platform.maintenanceBanner,
      demo: { showBanner: demo.showDemoBanner && demoStations.n > 0, demoStations: demoStations.n, simulator: config.demoSimulator, sessionSpeed: config.demoSessionSpeed },
      maps: { liveTraffic: !!config.mapboxToken, routing: routingChainNames() },
      payments: { provider: paymentProvider().name, demo: paymentProvider().isDemo },
    };
  });
}
