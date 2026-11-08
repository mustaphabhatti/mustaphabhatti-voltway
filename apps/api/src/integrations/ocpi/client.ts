// ─────────────────────────────────────────────────────────────────────────────
// OCPI 2.2.1 "Locations" pull client (eMSP role).
// Imports a CPO's locations/EVSEs/connectors as stations/ports and keeps
// EVSE status in sync (source = 'live').
// integration.config = { locationsUrl: string, token: string }
// ─────────────────────────────────────────────────────────────────────────────
import { ocpiStatusToPortStatus, type ConnectorType } from '@voltway/shared';
import { q, one } from '../../db';
import { fetchJson, reportError, reportOk } from '../health';

const STANDARD_MAP: Record<string, ConnectorType> = {
  IEC_62196_T2: 'Type2',
  IEC_62196_T2_COMBO: 'CCS2',
  IEC_62196_T1: 'Type1',
  IEC_62196_T1_COMBO: 'CCS1',
  CHADEMO: 'CHAdeMO',
  GBT_AC: 'GBT_AC',
  GBT_DC: 'GBT_DC',
  TESLA_S: 'NACS',
  NEMA_5_20: 'Type1',
};

export function mapOcpiConnector(c: any) {
  const type = STANDARD_MAP[c.standard] ?? 'Type2';
  const dc = c.power_type === 'DC';
  const phases = c.power_type === 'AC_3_PHASE' ? 3 : 1;
  const watts = c.max_electric_power ?? (c.max_voltage ?? 230) * (c.max_amperage ?? 16) * (dc ? 1 : phases);
  return {
    connectorType: type,
    currentType: dc ? ('DC' as const) : ('AC' as const),
    maxPowerKw: Math.round(watts / 100) / 10,
    voltage: c.max_voltage ?? null,
    amperage: c.max_amperage ?? null,
  };
}

export async function syncOcpi(integrationId: string) {
  const integ = await one<any>('SELECT * FROM integrations WHERE id = $1 AND kind = $2', [integrationId, 'ocpi']);
  if (!integ) throw new Error('OCPI integration not found');
  if (!integ.company_id) throw new Error('Assign the integration to a company first');
  const { locationsUrl, token } = integ.config ?? {};
  if (!locationsUrl || !token) throw new Error('locationsUrl and token are required');
  const { setPortStatus } = await import('../../services/portStatus');
  let url: string | null = locationsUrl;
  let imported = 0;
  try {
    while (url) {
      const res: any = await fetchJson<any>(url, { headers: { Authorization: `Token ${token}` }, timeoutMs: 20_000 });
      for (const loc of res.data ?? []) {
        const st = await one<any>(
          `INSERT INTO stations(company_id, name, address, city, country, postal_code, location, timezone, is_24_7,
                                listing_status, integration_type, integration_ref, data_source)
           VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($7,$8),4326)::geography, $9, $10, 'pending', 'ocpi', $11, 'ocpi')
           ON CONFLICT DO NOTHING RETURNING id`,
          [integ.company_id, loc.name ?? loc.address, loc.address, loc.city, loc.country ?? 'PK', loc.postal_code ?? null,
           Number(loc.coordinates.longitude), Number(loc.coordinates.latitude), loc.time_zone ?? 'UTC', !!loc.opening_times?.twentyfourseven, loc.id],
        );
        const stationId = st?.id ?? (await one<any>('SELECT id FROM stations WHERE integration_ref = $1 AND company_id = $2', [loc.id, integ.company_id]))?.id;
        if (!stationId) continue;
        for (const evse of loc.evses ?? []) {
          for (const c of evse.connectors ?? []) {
            const m = mapOcpiConnector(c);
            const uid = `${evse.uid}:${c.id}`;
            const port = await one<any>(
              `INSERT INTO ports(station_id, label, evse_uid, connector_type, current_type, max_power_kw, voltage, amperage, status_source)
               SELECT $1,$2,$3,$4,$5,$6,$7,$8,'live'
               WHERE NOT EXISTS (SELECT 1 FROM ports WHERE station_id = $1 AND evse_uid = $3)
               RETURNING id`,
              [stationId, evse.evse_id ?? evse.uid, uid, m.connectorType, m.currentType, m.maxPowerKw || 7.4, m.voltage, m.amperage],
            );
            const portId = port?.id ?? (await one<any>('SELECT id FROM ports WHERE station_id = $1 AND evse_uid = $2', [stationId, uid]))?.id;
            if (portId) await setPortStatus(portId, ocpiStatusToPortStatus(evse.status), 'live');
          }
        }
        imported++;
      }
      // OCPI pagination via Link header is not available through fetchJson; use offset/limit when provided.
      url = null;
    }
    await q('UPDATE integrations SET last_sync_at = now(), status_message = $2 WHERE id = $1', [integrationId, `Imported ${imported} location(s)`]);
    reportOk(`ocpi:${integ.name}`);
    return { imported };
  } catch (e) {
    await q('UPDATE integrations SET status_message = $2 WHERE id = $1', [integrationId, `Sync failed: ${(e as Error).message}`]);
    reportError(`ocpi:${integ.name}`, e);
    throw e;
  }
}
