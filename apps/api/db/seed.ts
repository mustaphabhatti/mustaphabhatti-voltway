// Seeds the database with clearly-labelled DEMO data.  Run: npm run db:seed
import bcrypt from 'bcryptjs';
import { CONNECTOR_CURRENT, estimateCharging, normalizeTariff, costForEnergyChunks, localTime, type ConnectorType } from '@voltway/shared';
import { pool } from '../src/db';
import {
  COMPANIES, DEMO_PASSWORD, FIRST_NAMES, LAST_NAMES, PLACES, PROFILES, REVIEW_TEXT, ROAD_EDGES, ROAD_NODES, STATIONS, VEHICLE_MODELS,
} from './seed-data';

// Deterministic PRNG so every seed produces the same demo world.
let seed = 20261108;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);

async function insertMany(table: string, cols: string[], rows: unknown[][], suffix = '') {
  const chunk = Math.max(1, Math.floor(60000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`).join(',');
    await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values} ${suffix}`, params);
  }
}

async function main() {
  const existing = await pool.query('SELECT COUNT(*)::int n FROM users');
  if (existing.rows[0].n > 0 && !process.argv.includes('--force')) {
    console.log('Database already has data — skipping seed (use npm run db:reset to start over).');
    await pool.end();
    return;
  }
  console.log('Seeding demo data…');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Vehicle catalogue ──
  const models: any[] = [];
  for (const m of VEHICLE_MODELS) {
    const r = await pool.query(
      `INSERT INTO vehicle_models(brand, model, variant, battery_kwh, max_ac_kw, max_dc_kw, connectors, curve_profile, efficiency_wh_km)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, m as any);
    models.push(r.rows[0]);
  }

  // ── Users ──
  const mkUser = async (email: string, name: string, role: string, phone: string | null = null, daysAgo = 120) =>
    (await pool.query(
      `INSERT INTO users(email, phone, password_hash, full_name, role, created_at, last_login_at) VALUES ($1,$2,$3,$4,$5, now() - make_interval(days => $6), now() - interval '1 day') RETURNING id`,
      [email, phone, hash, name, role, daysAgo])).rows[0].id as string;
  const adminId = await mkUser('admin@voltway.demo', 'Platform Admin', 'admin', null, 200);
  const driverId = await mkUser('driver@voltway.demo', 'Zara Ahmed', 'driver', '+923001234567', 95);
  const drivers: string[] = [driverId];
  for (let i = 0; i < 46; i++) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    drivers.push(await mkUser(`driver${i + 1}@example.demo`, name, 'driver', null, Math.floor(between(1, 90))));
  }
  await insertMany('user_preferences', ['user_id', 'notification_prefs'], [adminId, ...drivers].map((id) => [id, {}]));
  await pool.query(`UPDATE user_preferences SET home_city = 'Lahore', min_arrival_soc = 15 WHERE user_id = $1`, [driverId]);

  // Demo driver vehicles
  const ioniq = models.find((m) => m.model === 'Ioniq 5');
  const atto = models.find((m) => m.model === 'Atto 3');
  const v1 = (await pool.query(
    `INSERT INTO user_vehicles(user_id, model_id, nickname, brand, model, battery_kwh, max_ac_kw, max_dc_kw, connectors, curve_profile, efficiency_wh_km, current_soc, target_soc, is_default)
     VALUES ($1,$2,'Daily driver',$3,$4,$5,$6,$7,$8,$9,$10,42,80,true) RETURNING id`,
    [driverId, ioniq.id, ioniq.brand, ioniq.model, ioniq.battery_kwh, ioniq.max_ac_kw, ioniq.max_dc_kw, ioniq.connectors, ioniq.curve_profile, ioniq.efficiency_wh_km])).rows[0].id;
  await pool.query(
    `INSERT INTO user_vehicles(user_id, model_id, nickname, brand, model, battery_kwh, max_ac_kw, max_dc_kw, connectors, curve_profile, efficiency_wh_km, current_soc, target_soc)
     VALUES ($1,$2,'Family car',$3,$4,$5,$6,$7,$8,$9,$10,65,90)`,
    [driverId, atto.id, atto.brand, atto.model, atto.battery_kwh, atto.max_ac_kw, atto.max_dc_kw, atto.connectors, atto.curve_profile, atto.efficiency_wh_km]);
  // Vehicles for synthetic drivers (used for historical sessions)
  const driverVehicles: { user: string; vehicle: string; model: any }[] = [{ user: driverId, vehicle: v1, model: ioniq }];
  for (const d of drivers.slice(1)) {
    const m = pick(models.filter((x) => x.max_dc_kw > 0));
    const r = await pool.query(
      `INSERT INTO user_vehicles(user_id, model_id, brand, model, battery_kwh, max_ac_kw, max_dc_kw, connectors, curve_profile, efficiency_wh_km, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING id`,
      [d, m.id, m.brand, m.model, m.battery_kwh, m.max_ac_kw, m.max_dc_kw, m.connectors, m.curve_profile, m.efficiency_wh_km]);
    driverVehicles.push({ user: d, vehicle: r.rows[0].id, model: m });
  }

  await insertMany('payment_methods', ['user_id', 'type', 'provider', 'label', 'brand', 'last4', 'is_default'], [
    [driverId, 'card', 'demo', 'Visa ending 4242 (demo)', 'visa', '4242', true],
    [driverId, 'local_gateway', 'demo', 'Mobile wallet (demo)', null, null, false],
  ]);

  // ── Companies, operators, tariffs ──
  const companyIds: Record<string, string> = {};
  const tariffIds: Record<string, string> = {};
  const tariffConfigs: Record<string, any> = {};
  for (const c of COMPANIES) {
    const ownerId = await mkUser(c.email, c.owner, 'operator', null, c.status === 'pending' ? 3 : 180);
    await pool.query('INSERT INTO user_preferences(user_id) VALUES ($1)', [ownerId]);
    const r = await pool.query(
      `INSERT INTO companies(name, slug, legal_name, registration_number, tax_id, email, phone, website, address, country, brand_color, description,
                             verification_status, verified_at, verified_by, created_by, is_demo, documents, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $13 = 'verified' THEN now() - interval '150 days' END, CASE WHEN $13 = 'verified' THEN $14::uuid END, $15, true, $16,
               now() - make_interval(days => $17))
       RETURNING id`,
      [c.name, c.key, c.legal, `REG-${Math.floor(between(100000, 999999))}`, `NTN-${Math.floor(between(1000000, 9999999))}`, c.email,
       c.country === 'AE' ? '+97140000000' : '+924200000000', `https://${c.key}.example`, c.country === 'AE' ? 'Business Bay, Dubai' : 'Gulberg, Lahore',
       c.country, c.color, c.description, c.status, adminId, ownerId,
       JSON.stringify([{ name: 'Certificate of incorporation (demo).pdf', path: null, kind: 'registration', uploadedAt: new Date().toISOString() }]),
       c.status === 'pending' ? 3 : 180]);
    companyIds[c.key] = r.rows[0].id;
    await pool.query('INSERT INTO company_members(company_id, user_id, member_role) VALUES ($1,$2,$3)', [r.rows[0].id, ownerId, 'owner']);
    for (const [tk, cfg] of Object.entries(c.tariffs)) {
      const full = normalizeTariff(cfg);
      const t = await pool.query(`INSERT INTO tariffs(company_id, name, config) VALUES ($1,$2,$3) RETURNING id`,
        [r.rows[0].id, `${c.name.split(' ')[0]} ${tk === 'ac' ? 'AC Saver' : tk === 'fast' ? 'Fast (time-of-use)' : tk === 'dc' ? 'DC Standard' : tk === 'tou' ? 'Time-of-use' : tk === 'corridor' ? 'Corridor flat rate' : 'Standard'}`, full]);
      tariffIds[`${c.key}:${tk}`] = t.rows[0].id;
      tariffConfigs[`${c.key}:${tk}`] = full;
    }
  }

  // ── Stations & ports ──
  type PortInfo = { id: string; type: ConnectorType; kw: number; current: 'AC' | 'DC' };
  const stationRows: { id: string; seed: (typeof STATIONS)[number]; ports: PortInfo[]; tariff: any }[] = [];
  const now = Date.now();
  for (const s of STATIONS) {
    const listing = s.listing ?? 'approved';
    const r = await pool.query(
      `INSERT INTO stations(company_id, tariff_id, name, description, address, city, region, country, location, timezone, phone, is_24_7, opening_hours,
                            amenities, payment_methods, parking_info, listing_status, maintenance_mode, maintenance_note, reservations_enabled, reservation_fee,
                            integration_type, data_source, is_demo, info_updated_at, created_at, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ST_SetSRID(ST_MakePoint($10,$9),4326)::geography, $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'demo',true,
               now() - make_interval(days => $24), now() - interval '160 days', $25)
       RETURNING id`,
      [companyIds[s.company], tariffIds[`${s.company}:${s.tariff}`], s.name,
       s.description ?? `${PROFILES[s.profile].length} charging points operated by ${COMPANIES.find((c) => c.key === s.company)!.name}. Demo listing.`,
       s.address, s.city, s.region, s.country, s.lat, s.lng, s.tz, s.country === 'AE' ? '+97140000000' : '+924200000000', !!s.is247,
       JSON.stringify(s.hours ?? []), s.amenities, s.payments, s.parking ?? null, listing, s.scenario === 'maintenance',
       s.scenario === 'maintenance' ? 'Scheduled cabinet maintenance — expected back by tomorrow 10:00.' : null, !!s.reservations, s.fee ?? 0, s.integration,
       Math.floor(between(2, 40)), []]);
    const stationId = r.rows[0].id;
    const ports: PortInfo[] = [];
    let ocppId = 1;
    for (const p of PROFILES[s.profile]) {
      const current = CONNECTOR_CURRENT[p.type as ConnectorType];
      let status = 'available';
      let source = s.integration === 'simulator' ? 'simulated' : 'operator_reported';
      let ageMin = s.integration === 'simulator' ? between(1, 10) : between(30, 600);
      const roll = rnd();
      if (roll < 0.35) status = current === 'DC' ? 'charging' : 'occupied';
      else if (roll < 0.4) status = 'out_of_service';
      if (s.scenario === 'no_power') { status = 'no_power'; source = 'simulated'; ageMin = between(5, 25); }
      if (s.scenario === 'maintenance') { status = 'out_of_service'; source = 'operator_reported'; ageMin = 240; }
      if (s.scenario === 'unknown') { status = 'unknown'; source = 'operator_reported'; ageMin = 60 * 24 * 6; }
      if (s.scenario === 'stale') { ageMin = 60 * 30; }
      const pr = await pool.query(
        `INSERT INTO ports(station_id, label, evse_uid, connector_type, current_type, max_power_kw, voltage, amperage, power_group, status, status_source, status_updated_at, ocpp_connector_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() - make_interval(mins => $12), $13) RETURNING id`,
        [stationId, p.label, `${s.country}*${s.company.toUpperCase().slice(0, 3)}*E${stationId.slice(0, 4).toUpperCase()}${ocppId}`, p.type, current, p.kw, p.v ?? null, p.a ?? null,
         p.group ?? null, status, source, Math.round(ageMin), ocppId++]);
      ports.push({ id: pr.rows[0].id, type: p.type as ConnectorType, kw: p.kw, current });
    }
    stationRows.push({ id: stationId, seed: s, ports, tariff: tariffConfigs[`${s.company}:${s.tariff}`] });
  }

  // Register a demo OCPP identity (no charger connected — station stays "operator reported" until one connects)
  const ravi = stationRows.find((s) => s.seed.name.includes('Ravi'))!;
  await pool.query(`INSERT INTO charge_points(id, station_id, vendor, model) VALUES ('AMPWAY-RAVI-01', $1, 'Demo', 'DC150')`, [ravi.id]);

  // ── Historical sessions (90 days) for analytics & popular times ──
  console.log('Generating 90 days of historical sessions…');
  const sessionRows: unknown[][] = [];
  const eventRows: unknown[][] = [];
  const lambda: Record<string, number> = { hpc: 9, motorway: 6, dc: 5, mixed: 4.5, gbt: 3.5, ac: 3, small: 2 };
  const hourWeights = (motorway: boolean) =>
    Array.from({ length: 24 }, (_, h) => (motorway ? (h >= 7 && h <= 22 ? 1 : 0.25) : h < 6 ? 0.15 : h < 8 ? 0.5 : h < 11 ? 1.2 : h < 13 ? 0.9 : h < 16 ? 1.1 : h < 18 ? 1 : h < 22 ? 1.5 : 0.6));
  const sampleHour = (w: number[]) => {
    const total = w.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    for (let h = 0; h < 24; h++) { r -= w[h]; if (r <= 0) return h; }
    return 23;
  };
  for (const st of stationRows.filter((s) => (s.seed.listing ?? 'approved') === 'approved')) {
    const w = hourWeights(st.seed.profile === 'motorway');
    const portFree = new Map<string, number>();
    for (let day = 90; day >= 0; day--) {
      const weekday = new Date(now - day * 86400_000).getUTCDay();
      const growth = 0.6 + 0.4 * ((90 - day) / 90); // network growth over time
      const weekend = weekday === 5 || weekday === 6 || weekday === 0 ? 1.15 : 1;
      const n = Math.round(lambda[st.seed.profile] * growth * weekend * between(0.6, 1.4));
      const starts = Array.from({ length: n }, () => {
        const h = sampleHour(w);
        // hour is local; convert to UTC using the station offset (+5 PK, +4 AE)
        const offset = st.seed.tz === 'Asia/Dubai' ? 4 : 5;
        const d = new Date(now - day * 86400_000);
        d.setUTCHours(h - offset, Math.floor(rnd() * 60), 0, 0);
        return d.getTime();
      }).sort((a, b) => a - b);
      for (const start of starts) {
        const port = pick(st.ports);
        if ((portFree.get(port.id) ?? 0) > start) continue;
        const dv = pick(driverVehicles.filter((x) => x.user !== driverId && (x.model.connectors as string[]).includes(port.type)));
        if (!dv) continue;
        const m = dv.model;
        const startSoc = Math.round(between(8, 50));
        const targetSoc = Math.round(port.current === 'DC' ? between(65, 88) : between(70, 100));
        const est = estimateCharging({
          vehicle: { batteryKwh: m.battery_kwh, maxAcKw: m.max_ac_kw, maxDcKw: m.max_dc_kw, curveProfile: m.curve_profile },
          charger: { powerKw: port.kw, currentType: port.current }, startSoc, targetSoc, stepSoc: 2,
        });
        if (est.durationMinutes <= 0) continue;
        const dur = Math.min(est.durationMinutes * between(0.95, 1.15), port.current === 'AC' ? 360 : 120);
        const end = start + dur * 60_000;
        if (end > now - 5 * 60_000) continue;
        portFree.set(port.id, end + between(2, 20) * 60_000);
        const energy = est.energyFromChargerKwh * (dur / est.durationMinutes > 1 ? 1 : dur / est.durationMinutes);
        const cost = costForEnergyChunks(st.tariff, [{ kwh: energy, at: new Date(start + dur * 30_000) }], dur, st.seed.tz);
        const isMain = dv.user === driverId;
        sessionRows.push([dv.user, st.id, port.id, dv.vehicle, isMain ? 'completed' : 'completed', 'historical', new Date(start), new Date(end),
          startSoc, targetSoc, targetSoc, Math.round(energy * 1000) / 1000, cost.total, cost, cost.currency, true]);
        eventRows.push([port.id, st.id, port.current === 'DC' ? 'charging' : 'occupied', 'simulated', new Date(start)]);
        eventRows.push([port.id, st.id, 'available', 'simulated', new Date(end)]);
      }
    }
    // A few historical outages
    for (let k = 0; k < 2; k++) {
      const port = pick(st.ports);
      const t0 = now - between(5, 80) * 86400_000;
      eventRows.push([port.id, st.id, rnd() < 0.5 ? 'out_of_service' : 'offline', 'operator_reported', new Date(t0)]);
      eventRows.push([port.id, st.id, 'available', 'operator_reported', new Date(t0 + between(1, 10) * 3600_000)]);
    }
  }
  // Give the demo driver a richer personal history: re-assign ~16 sessions at Lahore stations.
  const lahore = new Set(stationRows.filter((s) => s.seed.city === 'Lahore').map((s) => s.id));
  let given = 0;
  for (const row of sessionRows) {
    if (given >= 16) break;
    if (lahore.has(row[1] as string) && rnd() < 0.01) {
      const port = stationRows.find((s) => s.id === row[1])!.ports.find((p) => p.id === row[2])!;
      if (!(ioniq.connectors as string[]).includes(port.type)) continue;
      row[0] = driverId;
      row[3] = v1;
      given++;
    }
  }
  await insertMany('charging_sessions',
    ['user_id', 'station_id', 'port_id', 'vehicle_id', 'status', 'control_source', 'started_at', 'ended_at', 'start_soc', 'current_soc', 'target_soc', 'energy_kwh', 'cost_total', 'cost_breakdown', 'currency', 'is_demo'],
    sessionRows);
  eventRows.sort((a, b) => (a[4] as Date).getTime() - (b[4] as Date).getTime());
  await insertMany('port_status_events', ['port_id', 'station_id', 'status', 'source', 'created_at'], eventRows);
  // Current status as the latest event
  await pool.query(`INSERT INTO port_status_events(port_id, station_id, status, source, created_at)
                    SELECT id, station_id, status, status_source, status_updated_at FROM ports`);
  // Invoices for the demo driver
  await pool.query(
    `INSERT INTO invoices(number, session_id, user_id, company_id, amount, currency, breakdown, payment_status, payment_provider, provider_ref, issued_at)
     SELECT 'VW-' || nextval('invoice_number_seq'), cs.id, cs.user_id, s.company_id, cs.cost_total, cs.currency,
            cs.cost_breakdown || '{"demo": true, "paymentMethod": "Visa ending 4242 (demo)"}'::jsonb, 'paid', 'demo', 'demo_hist_' || substr(cs.id::text, 1, 8), cs.ended_at
       FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id WHERE cs.user_id = $1 ORDER BY cs.started_at`, [driverId]);
  console.log(`  ${sessionRows.length} sessions, ${eventRows.length} status events`);

  // ── Reviews ──
  const reviewRows: unknown[][] = [];
  for (const st of stationRows.filter((s) => (s.seed.listing ?? 'approved') === 'approved')) {
    const reviewers = new Set<string>();
    const n = Math.floor(between(2, 7));
    for (let i = 0; i < n; i++) {
      const u = pick(drivers.slice(1));
      if (reviewers.has(u)) continue;
      reviewers.add(u);
      const [rating, text] = st.seed.scenario === 'no_power' && i === 0 ? REVIEW_TEXT[10] : pick(REVIEW_TEXT);
      reviewRows.push([st.id, u, rating, text, new Date(now - between(1, 80) * 86400_000), rating <= 2 && rnd() < 0.6 ? 'Thanks for the feedback — we have added a second technician on evenings.' : null]);
    }
  }
  await insertMany('reviews', ['station_id', 'user_id', 'rating', 'comment', 'created_at', 'operator_reply'], reviewRows);
  // One flagged review for the moderation queue
  const flagged = await pool.query(`UPDATE reviews SET status = 'flagged', comment = 'Terrible!!! Visit my channel for free charging hacks www.spam.example' WHERE id = (SELECT id FROM reviews ORDER BY created_at LIMIT 1) RETURNING id`);
  await insertMany('review_reports', ['review_id', 'user_id', 'reason'], [[flagged.rows[0].id, drivers[3], 'Spam / advertising'], [flagged.rows[0].id, drivers[4], 'Not about the station']]);

  // ── Demo driver data ──
  const byName = (n: string) => stationRows.find((s) => s.seed.name === n)!.id;
  await insertMany('favorites', ['user_id', 'station_id'], [
    [driverId, byName('VoltGrid Gulberg Hub')], [driverId, byName('VoltGrid Thokar Niaz Baig')], [driverId, byName('AmpWay Bhera Service Area')], [driverId, byName('VoltGrid Blue Area')],
  ]);
  await pool.query(`INSERT INTO saved_places(user_id, label, address, location) VALUES
    ($1, 'Home', 'DHA Phase 5, Lahore', ST_SetSRID(ST_MakePoint(74.4089, 31.4627),4326)::geography),
    ($1, 'Office', 'Gulberg III, Lahore', ST_SetSRID(ST_MakePoint(74.3502, 31.5139),4326)::geography),
    ($1, 'Parents', 'F-7, Islamabad', ST_SetSRID(ST_MakePoint(73.0566, 33.7208),4326)::geography)`, [driverId]);
  const gulberg = stationRows.find((s) => s.seed.name === 'VoltGrid Gulberg Hub')!;
  await pool.query(
    `INSERT INTO reservations(user_id, station_id, port_id, vehicle_id, start_at, end_at, status, fee, currency)
     VALUES ($1,$2,$3,$4, now() + interval '1 day 2 hours', now() + interval '1 day 3 hours', 'confirmed', 150, 'PKR'),
            ($1,$2,$3,$4, now() - interval '9 days', now() - interval '9 days' + interval '1 hour', 'completed', 150, 'PKR')`,
    [driverId, gulberg.id, gulberg.ports[0].id, v1]);
  const notes: [string, string, string, number][] = [
    ['session_complete', 'Charging complete', 'VoltGrid Gulberg Hub: 38.2 kWh delivered, battery at 80%. (demo)', 26],
    ['price_change', 'Price update at VoltGrid Thokar Niaz Baig', 'Night off-peak rate is now PKR 65/kWh from 23:00. (demo)', 50],
    ['better_alternative', 'Cheaper option nearby', 'VoltGrid Packages Mall is PKR 25/kWh cheaper right now and 4 min further. (demo)', 3],
    ['reservation_reminder', 'Reservation confirmed', 'VoltGrid Gulberg Hub · HPC-1 tomorrow. (demo)', 1],
  ];
  for (const [type, title, body, hoursAgo] of notes)
    await pool.query(`INSERT INTO notifications(user_id, type, title, body, created_at, read_at) VALUES ($1,$2,$3,$4, now() - make_interval(hours => $5), CASE WHEN $5 > 24 THEN now() END)`,
      [driverId, type, title, body, hoursAgo]);

  // ── Admin queues ──
  await pool.query(
    `INSERT INTO complaints(user_id, station_id, company_id, category, subject, description, status, priority) VALUES
     ($1, $2, $3, 'charger_fault', 'Charger stopped at 63%', 'Session stopped by itself after 18 minutes at HPC-3 and I was still charged the session fee.', 'open', 'high'),
     ($4, $5, $6, 'station_info', 'Wrong opening hours', 'The station listing says 24/7 but the gate was locked at 2 am.', 'in_progress', 'normal'),
     ($1, NULL, NULL, 'app', 'Feature request: export invoices', 'It would be great to export monthly invoices as PDF for my company reimbursements.', 'open', 'low')`,
    [driverId, gulberg.id, companyIds.voltgrid, drivers[5], byName('AmpWay G-11 Express'), companyIds.ampway]);
  await pool.query(
    `INSERT INTO station_reports(station_id, port_id, user_id, kind, reported_status, message) VALUES
     ($1, NULL, $2, 'status', 'no_power', 'No electricity at the site since morning, guard says load management.'),
     ($3, NULL, $4, 'wrong_info', NULL, 'GB/T connector listed but only CCS2 available now.')`,
    [byName('VoltGrid Bahria Town'), drivers[7], byName('AmpWay GT Road Jhelum'), drivers[8]]);

  // ── Community: check-ins, community company, driver-submitted & coming-soon stations ──
  const communityCo = (await pool.query(
    `INSERT INTO companies(name, slug, legal_name, email, country, brand_color, description, verification_status, verified_at, is_community, is_demo)
     VALUES ('Voltway Community', 'community', 'Voltway', 'community@voltway.example', 'PK', '#64748b', 'Stations added by Voltway drivers.', 'verified', now(), true, true) RETURNING id`)).rows[0].id;
  const CHECKIN_COMMENTS: Record<string, string[]> = {
    charged: ['Quick and easy, no issues.', 'Worked first time with the app.', 'Got close to full rated power until ~60%.', 'Smooth session, café nearby while waiting.', 'All good, bays were clean.', ''],
    charging_now: ['Charging now, should be done in 30 min.', 'Plugged in on the fast charger.', ''],
    waiting: ['Both CCS bays taken, waiting ~15 min.', 'Queue of two cars ahead of me.', ''],
    could_not_charge: ['Charger showed an error and would not start.', 'Bay blocked by a petrol car.', 'No electricity at the site.', 'Payment kept failing in the app.'],
  };
  const PROBLEM_FOR: Record<string, string> = { 'Charger showed an error and would not start.': 'broken', 'Bay blocked by a petrol car.': 'blocked_by_ice', 'No electricity at the site.': 'no_power', 'Payment kept failing in the app.': 'payment_failed' };
  const checkinRows: unknown[][] = [];
  for (const st of stationRows.filter((x) => (x.seed.listing ?? 'approved') === 'approved')) {
    const failRate = st.seed.scenario === 'no_power' ? 0.45 : st.seed.scenario === 'unknown' ? 0.35 : st.seed.scenario === 'stale' ? 0.25 : between(0.03, 0.14);
    const n = st.seed.scenario === 'unknown' ? 2 : Math.floor(between(5, 18));
    for (let i = 0; i < n; i++) {
      const dv = pick(driverVehicles.slice(1));
      const r = rnd();
      const outcome = r < failRate ? 'could_not_charge' : r < failRate + 0.1 ? 'waiting' : 'charged';
      const comment = pick(CHECKIN_COMMENTS[outcome]);
      const port = pick(st.ports.filter((p) => (dv.model.connectors as string[]).includes(p.type))) ?? null;
      const kw = outcome === 'charged' && port ? Math.round(Math.min(port.kw, port.current === 'DC' ? dv.model.max_dc_kw : dv.model.max_ac_kw) * between(0.55, 0.92)) : null;
      checkinRows.push([st.id, port?.id ?? null, dv.user, `${dv.model.brand} ${dv.model.model}`, outcome,
        outcome === 'could_not_charge' ? PROBLEM_FOR[comment] ?? 'other' : null, kw, outcome === 'charged' ? Math.round(between(15, 70)) : null, comment,
        new Date(now - between(0.05, 90) * 86400_000)]);
    }
  }
  // A recent "charging now" on Gulberg and a fresh success to show live community activity
  checkinRows.push([gulberg.id, gulberg.ports[2].id, drivers[9], 'Kia EV6', 'charged', null, 112, 24, 'Fast session, 18→80% in 24 minutes.', new Date(now - 40 * 60_000)]);
  await insertMany('checkins', ['station_id', 'port_id', 'user_id', 'vehicle_label', 'outcome', 'problem', 'kw_observed', 'duration_min', 'comment', 'created_at'], checkinRows);
  // Demo driver's own check-ins
  await insertMany('checkins', ['station_id', 'port_id', 'user_id', 'vehicle_label', 'outcome', 'problem', 'kw_observed', 'duration_min', 'comment', 'created_at'], [
    [gulberg.id, gulberg.ports[0].id, driverId, 'Hyundai Ioniq 5', 'charged', null, 165, 22, 'Great speeds on HPC-1.', new Date(now - 9 * 86400_000)],
    [byName('VoltGrid Thokar Niaz Baig'), null, driverId, 'Hyundai Ioniq 5', 'charged', null, 140, 20, 'Topped up before the motorway.', new Date(now - 21 * 86400_000)],
    [byName('AmpWay Bhera Service Area'), null, driverId, 'Hyundai Ioniq 5', 'waiting', null, null, null, 'Short queue on Friday evening.', new Date(now - 33 * 86400_000)],
  ]);
  // Community-submitted station awaiting review + an approved "coming soon" listing
  await pool.query(
    `INSERT INTO stations(company_id, name, description, address, city, country, location, timezone, listing_status, submitted_by, data_source, location_type, host_notes, is_demo, amenities)
     VALUES ($1, 'Hotel One Charging Bay', 'Added by the Voltway driver community.', 'Main Boulevard, Gulberg II', 'Lahore', 'PK', ST_SetSRID(ST_MakePoint(74.3405, 31.5265),4326)::geography,
             'Asia/Karachi', 'pending', $2, 'community', 'destination', 'Price: free for hotel guests', true, '{restaurant,parking}')`, [communityCo, drivers[11]]);
  const pend = await pool.query(`SELECT id FROM stations WHERE name = 'Hotel One Charging Bay'`);
  await pool.query(`INSERT INTO ports(station_id, label, connector_type, current_type, max_power_kw, status, status_source, status_updated_at) VALUES ($1,'AC-1','Type2','AC',11,'unknown','user_reported',now())`, [pend.rows[0].id]);
  await pool.query(
    `INSERT INTO stations(company_id, name, description, address, city, country, location, timezone, listing_status, submitted_by, data_source, location_type, coming_soon, is_demo)
     VALUES ($1, 'Lahore Ring Road Supercharging Plaza (coming soon)', 'Planned 12-bay high-power plaza reported by drivers. Expected to open next year.', 'Ring Road, near Niazi Chowk', 'Lahore', 'PK',
             ST_SetSRID(ST_MakePoint(74.3080, 31.6050),4326)::geography, 'Asia/Karachi', 'approved', $2, 'community', 'highway', true, true)`, [communityCo, drivers[12]]);

  // ── Gazetteer & road graph ──
  await insertMany('places', ['name', 'kind', 'city', 'country', 'location'],
    PLACES.map(([name, kind, city, country, lat, lng]) => [name, kind, city, country, `SRID=4326;POINT(${lng} ${lat})`]));
  await insertMany('road_nodes', ['id', 'name', 'lat', 'lng'], ROAD_NODES.map((n) => [...n]));
  await insertMany('road_edges', ['a', 'b', 'road', 'speed_kmh'], ROAD_EDGES.map((e) => [...e]));

  await pool.query(`INSERT INTO platform_settings(key, value) VALUES ('platform', $1)`, [{ name: 'Voltway', supportEmail: 'support@voltway.example', defaultCity: 'Lahore', maintenanceBanner: '' }]);

  console.log(`\n✔ Demo data ready: ${stationRows.length} stations, ${stationRows.reduce((a, s) => a + s.ports.length, 0)} ports.`);
  console.log(`  Driver:   driver@voltway.demo / ${DEMO_PASSWORD}`);
  console.log(`  Operator: ops@voltgrid.demo / ${DEMO_PASSWORD}`);
  console.log(`  Admin:    admin@voltway.demo / ${DEMO_PASSWORD}`);
  void localTime;
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
