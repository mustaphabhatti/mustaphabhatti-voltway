import { localTime, normalizeTariff, parseHHMM } from '@wattly/shared';
import { q } from '../db';
import { notify } from '../services/notifications';
import { setPortStatus } from '../services/portStatus';
import { controllerFor, idTagFor } from '../services/sessions';
import { getSetting } from '../routes/admin';

const sourceFor = (integration: string) => (integration === 'ocpp' ? 'live' : integration === 'simulator' ? 'simulated' : 'operator_reported') as any;

async function reservationJobs() {
  const { reservationReminderMinutes } = await getSetting('notifications');
  // Reminders
  const due = await q<any>(
    `UPDATE reservations r SET reminded = true FROM stations s, ports p
      WHERE s.id = r.station_id AND p.id = r.port_id AND r.status = 'confirmed' AND NOT r.reminded
        AND r.start_at <= now() + make_interval(mins => $1) AND r.start_at > now() - interval '5 minutes'
      RETURNING r.id, r.user_id, r.start_at, r.port_id, r.end_at, s.name station_name, s.integration_type, p.label, p.status, p.ocpp_connector_id,
                (SELECT id FROM charge_points WHERE station_id = s.id LIMIT 1) cp`,
    [reservationReminderMinutes],
  );
  for (const r of due) {
    await notify(r.user_id, 'reservation_reminder', 'Your reservation starts soon',
      `${r.station_name} · ${r.label} is held for you from ${new Date(r.start_at).toUTCString().slice(17, 22)} UTC.`, { reservationId: r.id }, `resv-remind:${r.id}`);
    // Hold the port
    try {
      await controllerFor(r.integration_type)?.reserve?.({ reservationId: r.id, portId: r.port_id, chargePointId: r.cp, ocppConnectorId: r.ocpp_connector_id, expiresAt: new Date(r.end_at), idTag: idTagFor(r.user_id) });
    } catch { /* charger may refuse — Wattly still holds the slot */ }
    if (r.status === 'available') await setPortStatus(r.port_id, 'reserved', sourceFor(r.integration_type));
  }
  // No-shows: 15 minutes after start without a session
  const expired = await q<any>(
    `UPDATE reservations r SET status = 'expired' FROM stations s
      WHERE s.id = r.station_id AND r.status = 'confirmed' AND r.start_at < now() - interval '15 minutes'
      RETURNING r.id, r.user_id, r.port_id, s.integration_type, s.name`,
  );
  for (const r of expired) {
    await setPortStatus(r.port_id, 'available', sourceFor(r.integration_type));
    await notify(r.user_id, 'reservation_reminder', 'Reservation expired', `Your hold at ${r.name} was released after the 15-minute grace period.`, { reservationId: r.id }, `resv-exp:${r.id}`);
  }
  // Finished reservations still holding a port
  const ended = await q<any>(
    `UPDATE reservations r SET status = 'completed' FROM stations s WHERE s.id = r.station_id AND r.status = 'active' AND r.end_at < now() - interval '2 hours'
     RETURNING r.port_id`,
  );
  void ended;
  await q(`DELETE FROM station_watches WHERE expires_at < now()`);
  // "Charging now" check-ins expire: free the port again (still labelled as a driver report).
  const done = await q<any>(
    `UPDATE checkins c SET charging_until = NULL FROM ports p, stations s
      WHERE p.id = c.port_id AND s.id = p.station_id AND c.charging_until IS NOT NULL AND c.charging_until < now()
      RETURNING c.port_id, p.status, p.status_source, s.integration_type`,
  );
  for (const d of done) if (d.integration_type === 'none' && d.status === 'occupied' && d.status_source === 'user_reported') await setPortStatus(d.port_id, 'available', 'user_reported');
}

async function peakWarnings() {
  const { peakWarningMinutes } = await getSetting('notifications');
  const rows = await q<any>(
    `SELECT f.user_id, s.id, s.name, s.timezone, t.config FROM favorites f JOIN stations s ON s.id = f.station_id JOIN tariffs t ON t.id = s.tariff_id
      WHERE f.notify AND s.listing_status = 'approved' AND jsonb_array_length(t.config->'periods') > 0`,
  );
  const now = new Date();
  for (const r of rows) {
    const t = normalizeTariff(r.config);
    const lt = localTime(now, r.timezone);
    for (const p of t.periods.filter((p) => p.kind === 'peak' && (!p.days?.length || p.days.includes(lt.dow)))) {
      const until = parseHHMM(p.start) - lt.minutes;
      if (until > 0 && until <= peakWarningMinutes) {
        const offPeak = t.periods.find((x) => x.kind === 'off_peak' || x.kind === 'super_off_peak');
        await notify(r.user_id, 'peak_schedule', `Peak pricing at ${r.name} in ${until} min`,
          `${p.label}: ${t.currency} ${p.rate}/kWh from ${p.start} to ${p.end}.${offPeak ? ` Off-peak ${t.currency} ${offPeak.rate}/kWh from ${offPeak.start}.` : ''}`,
          { stationId: r.id }, `peak:${r.id}:${lt.date}:${p.start}`);
      }
    }
  }
}

export function startScheduler(log: (m: string) => void) {
  const run = (name: string, fn: () => Promise<void>) => fn().catch((e) => log(`job ${name} failed: ${e.message}`));
  setInterval(() => run('reservations', reservationJobs), 60_000);
  setInterval(() => run('peak', peakWarnings), 5 * 60_000);
  run('reservations', reservationJobs);
}
