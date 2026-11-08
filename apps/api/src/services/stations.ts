import {
  CONNECTOR_CURRENT,
  STALE_STATUS_MINUTES,
  ageMinutes,
  haversineKm,
  inTimeWindow,
  localTime,
  normalizeTariff,
  rateAt,
  summarizePorts,
  reliabilityScore,
  type ConnectorType,
  type DataSource,
  type PortStatus,
} from '@voltway/shared';
import { q, one, type Queryable, pool } from '../db';
import { typicalTrafficFactor } from '../integrations/maps/traffic';

export interface PortRow {
  id: string;
  label: string;
  evse_uid: string | null;
  connector_type: ConnectorType;
  current_type: 'AC' | 'DC';
  max_power_kw: number;
  voltage: number | null;
  amperage: number | null;
  power_group: string | null;
  status: PortStatus;
  status_source: DataSource;
  status_updated_at: string | null;
  ocpp_connector_id: number | null;
  is_active: boolean;
  tariff_id: string | null;
}

/** Shared SELECT for stations with everything needed to render cards and detail pages. */
export const STATION_SELECT = `
  SELECT s.*, ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng,
         c.name AS company_name, c.slug AS company_slug, c.brand_color, c.verification_status AS company_verification,
         t.config AS tariff_config, t.name AS tariff_name, t.updated_at AS tariff_updated_at,
         COALESCE(r.avg_rating, NULL) AS avg_rating, COALESCE(r.review_count, 0) AS review_count,
         COALESCE(p.ports, '[]'::json) AS ports,
         COALESCE(st.avg_session_min, 45) AS avg_session_min,
         ck.w_ok, ck.w_wait, ck.w_fail, ck.n_checkins, ck.last_checkin_at, ck.last_outcome, ck.last_ok_at,
         c.is_community, (SELECT COUNT(*)::int FROM station_photos ph WHERE ph.station_id = s.id AND ph.status = 'visible') AS photo_count
    FROM stations s
    JOIN companies c ON c.id = s.company_id
    LEFT JOIN tariffs t ON t.id = s.tariff_id
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(rating)::numeric, 1)::float AS avg_rating, COUNT(*)::int AS review_count
        FROM reviews WHERE station_id = s.id AND status = 'visible'
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'id', p.id, 'label', p.label, 'evse_uid', p.evse_uid, 'connector_type', p.connector_type, 'current_type', p.current_type,
        'max_power_kw', p.max_power_kw, 'voltage', p.voltage, 'amperage', p.amperage, 'power_group', p.power_group,
        'status', p.status, 'status_source', p.status_source, 'status_updated_at', p.status_updated_at,
        'ocpp_connector_id', p.ocpp_connector_id, 'is_active', p.is_active, 'tariff_id', p.tariff_id
      ) ORDER BY p.label) AS ports
        FROM ports p WHERE p.station_id = s.id AND p.is_active
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::float AS avg_session_min
        FROM charging_sessions WHERE station_id = s.id AND ended_at IS NOT NULL AND started_at > now() - interval '60 days'
    ) st ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(EXP(-EXTRACT(EPOCH FROM now() - created_at) / 86400 / 130)) FILTER (WHERE outcome IN ('charged','charging_now')), 0)::float AS w_ok,
             COALESCE(SUM(EXP(-EXTRACT(EPOCH FROM now() - created_at) / 86400 / 130)) FILTER (WHERE outcome = 'waiting'), 0)::float AS w_wait,
             COALESCE(SUM(EXP(-EXTRACT(EPOCH FROM now() - created_at) / 86400 / 130)) FILTER (WHERE outcome = 'could_not_charge'), 0)::float AS w_fail,
             COUNT(*) FILTER (WHERE outcome <> 'comment')::int AS n_checkins,
             MAX(created_at) AS last_checkin_at,
             MAX(created_at) FILTER (WHERE outcome IN ('charged','charging_now')) AS last_ok_at,
             (ARRAY_AGG(outcome ORDER BY created_at DESC))[1] AS last_outcome
        FROM checkins WHERE station_id = s.id AND status = 'visible' AND created_at > now() - interval '365 days'
    ) ck ON true`;

export interface ShapeContext {
  origin?: { lat: number; lng: number } | null;
  connectors?: ConnectorType[]; // vehicle-compatible connectors
  now?: Date;
}

export function isOpenAt(row: { is_24_7: boolean; opening_hours: any[]; timezone: string }, at: Date) {
  if (row.is_24_7) return { open: true, label: 'Open 24/7' };
  const hours = (row.opening_hours ?? []) as { day: number; open: string; close: string }[];
  if (!hours.length) return { open: null as boolean | null, label: 'Hours not provided' };
  const lt = localTime(at, row.timezone);
  const today = hours.filter((h) => h.day === lt.dow);
  for (const h of today) {
    if (inTimeWindow(lt.minutes, h.open, h.close)) return { open: true, label: `Open · closes ${h.close}` };
  }
  const next = today.find((h) => lt.minutes < Number(h.open.slice(0, 2)) * 60 + Number(h.open.slice(3)));
  return { open: false, label: next ? `Closed · opens ${next.open}` : 'Closed today' };
}

export function freshness(source: DataSource, updatedAt: string | null, now = Date.now()) {
  const age = ageMinutes(updatedAt, now);
  const limit = (STALE_STATUS_MINUTES as Record<string, number>)[source] ?? Infinity;
  return { ageMinutes: Number.isFinite(age) ? Math.round(age) : null, stale: age > limit };
}

/** Estimated drive distance/time from a straight-line distance (used for lists; detail pages use the router). */
export function estimateTravel(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }, timeZone: string, at = new Date()) {
  const crow = haversineKm(origin, dest);
  const km = crow * (crow < 5 ? 1.4 : crow < 30 ? 1.3 : 1.2);
  const speed = km < 8 ? 24 : km < 30 ? 34 : km < 80 ? 55 : 80;
  const t = typicalTrafficFactor(at, timeZone, km < 60);
  return {
    distanceKm: Math.round(km * 10) / 10,
    straightLineKm: Math.round(crow * 10) / 10,
    travelMinutes: Math.round((km / speed) * 60 * t.factor),
    traffic: { level: t.level, source: 'estimated' as const },
  };
}

export function shapeStation(row: any, ctx: ShapeContext = {}) {
  const now = ctx.now ?? new Date();
  const ports: PortRow[] = (row.ports ?? []).map((p: any) => ({ ...p, max_power_kw: Number(p.max_power_kw) }));
  const summary = summarizePorts(ports, row.maintenance_mode);
  const tariff = normalizeTariff(row.tariff_config);
  const utilization = summary.total ? summary.inUse / summary.total : 0;
  const quote = row.tariff_config ? rateAt(tariff, now, row.timezone, utilization) : null;
  const connectors = [...new Set(ports.map((p) => p.connector_type))];
  const compatible = ctx.connectors?.length ? ports.filter((p) => ctx.connectors!.includes(p.connector_type)) : ports;
  const compatibleAvailable = compatible.filter((p) => p.status === 'available').length;
  const maxPower = Math.max(0, ...ports.map((p) => p.max_power_kw));
  const sources = [...new Set(ports.map((p) => p.status_source))];
  const latestUpdate = ports.reduce<string | null>(
    (a, p) => (!p.status_updated_at ? a : !a || p.status_updated_at > a ? p.status_updated_at : a),
    null,
  );
  const primarySource: DataSource = sources.includes('live') ? 'live' : sources.includes('simulated') ? 'simulated' : sources[0] ?? 'static';
  const fresh = freshness(primarySource, latestUpdate, now.getTime());
  const travel = ctx.origin ? estimateTravel(ctx.origin, { lat: row.lat, lng: row.lng }, row.timezone, now) : null;

  // Waiting time estimate: when no compatible port is free, assume the first busy port frees
  // up halfway through a typical session at this site.
  const busyCompatible = compatible.filter((p) => ['charging', 'occupied', 'reserved'].includes(p.status)).length;
  const workingCompatible = compatible.filter((p) => !['out_of_service', 'offline', 'no_power'].includes(p.status)).length;
  const waitMinutes = compatibleAvailable > 0 ? 0 : busyCompatible > 0 ? Math.round((row.avg_session_min ?? 45) / Math.max(1, busyCompatible) * 0.6 + 5) : null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
    lat: row.lat,
    lng: row.lng,
    timezone: row.timezone,
    phone: row.phone,
    operator: { id: row.company_id, name: row.company_name, slug: row.company_slug, brandColor: row.brand_color, verified: row.company_verification === 'verified' },
    is24_7: row.is_24_7,
    openingHours: row.opening_hours,
    openNow: isOpenAt(row, now),
    amenities: row.amenities,
    paymentMethods: row.payment_methods,
    parkingInfo: row.parking_info,
    accessType: row.access_type,
    images: row.images,
    listingStatus: row.listing_status,
    rejectionReason: row.rejection_reason,
    maintenanceMode: row.maintenance_mode,
    maintenanceNote: row.maintenance_note,
    reservationsEnabled: row.reservations_enabled,
    reservationFee: row.reservation_fee,
    integration: { type: row.integration_type, ref: row.integration_ref, supportsRemoteStart: ['ocpp', 'simulator'].includes(row.integration_type) },
    isDemo: row.is_demo,
    comingSoon: row.coming_soon,
    locationType: row.location_type,
    hostNotes: row.host_notes,
    community: !!row.is_community,
    photoCount: row.photo_count ?? 0,
    reliability: {
      score: reliabilityScore({ weightedSuccess: row.w_ok ?? 0, weightedWaiting: row.w_wait ?? 0, weightedFailure: row.w_fail ?? 0, checkinCount: row.n_checkins ?? 0, rating: row.avg_rating }),
      checkins: row.n_checkins ?? 0,
      lastCheckinAt: row.last_checkin_at ?? null,
      lastOutcome: row.last_outcome ?? null,
      lastSuccessAt: row.last_ok_at ?? null,
    },
    infoUpdatedAt: row.info_updated_at,
    rating: row.avg_rating,
    reviewCount: row.review_count,
    ports: ports.map((p) => ({
      id: p.id,
      label: p.label,
      evseUid: p.evse_uid,
      connectorType: p.connector_type,
      currentType: p.current_type,
      maxPowerKw: p.max_power_kw,
      voltage: p.voltage,
      amperage: p.amperage,
      powerGroup: p.power_group,
      status: p.status,
      statusSource: p.status_source,
      statusUpdatedAt: p.status_updated_at,
      statusStale: freshness(p.status_source, p.status_updated_at, now.getTime()).stale,
      compatible: !ctx.connectors?.length || ctx.connectors.includes(p.connector_type),
    })),
    summary,
    status: {
      operational: summary.operationalStatus,
      source: primarySource,
      updatedAt: latestUpdate,
      ageMinutes: fresh.ageMinutes,
      stale: fresh.stale,
    },
    connectors,
    hasDC: ports.some((p) => p.current_type === 'DC'),
    hasAC: ports.some((p) => p.current_type === 'AC'),
    maxPowerKw: maxPower,
    compatiblePorts: compatible.length,
    compatibleAvailable,
    compatibleWorking: workingCompatible,
    estimatedWaitMinutes: waitMinutes,
    pricing: quote
      ? {
          currency: tariff.currency,
          currentRate: quote.rate,
          periodLabel: quote.periodLabel,
          periodKind: quote.periodKind,
          baseRate: tariff.baseRate,
          sessionFee: tariff.sessionFee,
          parkingFeePerHour: tariff.parkingFeePerHour,
          idleFeePerMinute: tariff.idleFeePerMinute,
          idleGraceMinutes: tariff.idleGraceMinutes,
          serviceChargePercent: tariff.serviceChargePercent,
          timeFeePerMinute: tariff.timeFeePerMinute,
          taxPercent: tariff.taxPercent,
          hasTimeOfUse: tariff.periods.length > 0 || tariff.weekendRate != null,
          dynamic: tariff.dynamic.enabled,
          tariffName: row.tariff_name,
          updatedAt: row.tariff_updated_at,
        }
      : null,
    tariff: row.tariff_config ? tariff : null,
    tariffId: row.tariff_id ?? null,
    travel,
  };
}

export type ShapedStation = ReturnType<typeof shapeStation>;

export interface StationFilters {
  connectors?: ConnectorType[];
  currentTypes?: ('AC' | 'DC')[];
  minPowerKw?: number;
  maxPricePerKwh?: number;
  availableOnly?: boolean;
  openNow?: boolean;
  is24_7?: boolean;
  amenities?: string[];
  networks?: string[];
  text?: string;
  city?: string;
  minScore?: number;
  includeComingSoon?: boolean;
  locationTypes?: string[];
}

export async function listStations(opts: {
  near?: { lat: number; lng: number } | null;
  radiusKm?: number;
  bbox?: [number, number, number, number] | null; // west,south,east,north
  filters?: StationFilters;
  vehicleConnectors?: ConnectorType[];
  limit?: number;
  includeUnapproved?: boolean;
  companyId?: string;
}) {
  const f = opts.filters ?? {};
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (!opts.includeUnapproved) where.push(`s.listing_status = 'approved'`);
  if (opts.companyId) where.push(`s.company_id = ${p(opts.companyId)}`);
  let distanceExpr = 'NULL::float';
  if (opts.near) {
    const pt = `ST_SetSRID(ST_MakePoint(${p(opts.near.lng)}, ${p(opts.near.lat)}), 4326)::geography`;
    distanceExpr = `ST_Distance(s.location, ${pt}) / 1000`;
    if (opts.radiusKm) where.push(`ST_DWithin(s.location, ${pt}, ${p(opts.radiusKm * 1000)})`);
  }
  if (opts.bbox) {
    const [w, s, e, n] = opts.bbox;
    where.push(`s.location && ST_MakeEnvelope(${p(w)}, ${p(s)}, ${p(e)}, ${p(n)}, 4326)::geography`);
  }
  if (f.connectors?.length) where.push(`EXISTS (SELECT 1 FROM ports x WHERE x.station_id = s.id AND x.is_active AND x.connector_type = ANY(${p(f.connectors)}))`);
  if (f.currentTypes?.length) where.push(`EXISTS (SELECT 1 FROM ports x WHERE x.station_id = s.id AND x.is_active AND x.current_type = ANY(${p(f.currentTypes)}))`);
  if (f.minPowerKw) where.push(`EXISTS (SELECT 1 FROM ports x WHERE x.station_id = s.id AND x.is_active AND x.max_power_kw >= ${p(f.minPowerKw)})`);
  if (f.amenities?.length) where.push(`s.amenities @> ${p(f.amenities)}::text[]`);
  if (f.networks?.length) where.push(`(c.slug = ANY(${p(f.networks)}) OR c.id::text = ANY(${p(f.networks)}))`);
  if (f.is24_7) where.push('s.is_24_7');
  if (!f.includeComingSoon) where.push('NOT s.coming_soon');
  if (f.locationTypes?.length) where.push(`s.location_type = ANY(${p(f.locationTypes)})`);
  if (f.city) where.push(`s.city ILIKE ${p(f.city)}`);
  if (f.text) {
    const t = p(`%${f.text}%`);
    where.push(`(s.name ILIKE ${t} OR s.address ILIKE ${t} OR s.city ILIKE ${t} OR c.name ILIKE ${t})`);
  }
  const full = `
    WITH base AS (${STATION_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''})
    SELECT base.*, ${distanceExpr.replace(/s\.location/g, 'base.location')} AS distance_km
      FROM base
     ORDER BY ${opts.near ? 'distance_km ASC' : 'base.name ASC'}
     LIMIT ${p(Math.min(opts.limit ?? 200, 500))}`;
  const rows = await q<any>(full, params);
  const now = new Date();
  let out = rows.map((r) => ({ ...shapeStation(r, { origin: opts.near, connectors: opts.vehicleConnectors ?? f.connectors, now }), distanceKm: r.distance_km }));
  if (f.maxPricePerKwh) out = out.filter((s) => s.pricing && s.pricing.currentRate <= f.maxPricePerKwh!);
  if (f.availableOnly) out = out.filter((s) => s.compatibleAvailable > 0);
  if (f.openNow) out = out.filter((s) => s.openNow.open !== false);
  if (f.minScore) out = out.filter((s) => s.reliability.score != null && s.reliability.score >= f.minScore!);
  return out;
}

export async function getStation(id: string, ctx: ShapeContext = {}, db: Queryable = pool) {
  const row = await one<any>(`${STATION_SELECT} WHERE s.id = $1`, [id], db);
  return row ? shapeStation(row, ctx) : null;
}

/** Utilization-based "popular times" by hour of week, derived from historical sessions. Always labelled estimated. */
export async function occupancyForecast(stationId: string, timezone: string) {
  const rows = await q<{ dow: number; hour: number; minutes: number }>(
    `WITH hours AS (
       SELECT generate_series(date_trunc('hour', started_at), date_trunc('hour', COALESCE(ended_at, now())), interval '1 hour') AS h,
              started_at, COALESCE(ended_at, now()) AS ended_at
         FROM charging_sessions WHERE station_id = $1 AND started_at > now() - interval '8 weeks'
     )
     SELECT EXTRACT(DOW FROM h AT TIME ZONE $2)::int AS dow, EXTRACT(HOUR FROM h AT TIME ZONE $2)::int AS hour,
            SUM(EXTRACT(EPOCH FROM (LEAST(ended_at, h + interval '1 hour') - GREATEST(started_at, h))) / 60)::float AS minutes
       FROM hours GROUP BY 1, 2`,
    [stationId, timezone],
  );
  const ports = (await one<{ n: number }>('SELECT COUNT(*)::int n FROM ports WHERE station_id = $1 AND is_active', [stationId]))?.n ?? 1;
  const weeks = 8;
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows) grid[r.dow][r.hour] = Math.min(1, r.minutes / (60 * ports * weeks));
  return { source: 'estimated' as const, basis: `${weeks} weeks of session history`, grid };
}

export const connectorCurrent = (c: ConnectorType) => CONNECTOR_CURRENT[c];
