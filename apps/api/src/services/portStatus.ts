import { PORT_STATUS_LABELS, summarizePorts, type DataSource, type PortStatus } from '@voltway/shared';
import { q, one } from '../db';
import { publish } from '../realtime/hub';
import { notify, notifyFavorites } from './notifications';

/**
 * Single entry point for every port status change (OCPP, OCPI, operator, simulator, driver reports).
 * Persists the change, records history for analytics, broadcasts it and fires notifications.
 */
export async function setPortStatus(portId: string, status: PortStatus, source: DataSource) {
  const port = await one<any>(
    `UPDATE ports p SET status = $2, status_source = $3, status_updated_at = now()
       FROM (SELECT id, status AS old_status FROM ports WHERE id = $1 FOR UPDATE) old
      WHERE p.id = old.id
      RETURNING p.id, p.station_id, p.label, p.connector_type, p.status, old.old_status`,
    [portId, status, source],
  );
  if (!port) return null;
  if (port.old_status !== status) {
    await q('INSERT INTO port_status_events(port_id, station_id, status, source) VALUES ($1,$2,$3,$4)', [portId, port.station_id, status, source]);
  }
  const station = await one<any>('SELECT id, name, maintenance_mode FROM stations WHERE id = $1', [port.station_id]);
  const ports = await q<{ id: string; status: PortStatus }>('SELECT id, status FROM ports WHERE station_id = $1 AND is_active', [port.station_id]);
  const summary = summarizePorts(ports, station?.maintenance_mode);
  const payload = {
    stationId: port.station_id, portId, status, source, updatedAt: new Date().toISOString(), summary,
  };
  publish('stations', 'port.status', payload);
  publish(`station:${port.station_id}`, 'port.status', payload);

  if (port.old_status !== status && station) {
    // Availability watchers ("notify me when a charger frees up")
    if (status === 'available') {
      const watchers = await q<{ user_id: string }>(
        `DELETE FROM station_watches WHERE station_id = $1 AND expires_at > now()
           AND (cardinality(connector_types) = 0 OR $2 = ANY(connector_types)) RETURNING user_id`,
        [port.station_id, port.connector_type],
      );
      for (const w of watchers) {
        await notify(w.user_id, 'availability_change', `${station.name}: a charger is free`,
          `${port.label} (${port.connector_type}) just became available${source === 'simulated' ? ' (demo feed)' : ''}.`,
          { stationId: station.id, portId });
      }
    }
    if (summary.operationalStatus === 'offline' || summary.operationalStatus === 'no_power') {
      const day = new Date().toISOString().slice(0, 10);
      await notifyFavorites(port.station_id, 'station_outage', `${station.name} is ${summary.operationalStatus === 'no_power' ? 'without electricity' : 'offline'}`,
        `All chargers are currently ${PORT_STATUS_LABELS[status].toLowerCase()}. We'll suggest alternatives nearby.`,
        { status: summary.operationalStatus }, `outage:${port.station_id}:${day}`);
    }
  }
  return { ...payload, oldStatus: port.old_status };
}
