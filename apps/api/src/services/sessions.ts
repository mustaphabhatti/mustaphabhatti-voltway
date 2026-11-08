import { CONNECTOR_CURRENT, costForEnergyChunks, normalizeTariff, round, type ConnectorType } from '@wattly/shared';
import { q, one, tx } from '../db';
import { badRequest, conflict, forbidden, notFound, notImplemented } from '../lib/errors';
import type { AuthUser } from '../lib/auth';
import { publish, publishToUser } from '../realtime/hub';
import type { ChargingController } from '../integrations/charging/types';
import { simulatorController } from '../integrations/charging/simulator';
import { ocppController, isChargePointConnected } from '../integrations/charging/ocpp16';
import { paymentProvider } from '../integrations/payments';
import { notify } from './notifications';
import { setPortStatus } from './portStatus';

export function controllerFor(integrationType: string): ChargingController | null {
  if (integrationType === 'simulator') return simulatorController;
  if (integrationType === 'ocpp') return ocppController;
  return null;
}

const SESSION_COLUMNS = `cs.*, s.name AS station_name, s.timezone, s.integration_type, p.label AS port_label, p.connector_type,
  p.current_type, p.max_power_kw, v.nickname AS vehicle_name, v.brand AS vehicle_brand, v.model AS vehicle_model, v.battery_kwh,
  v.max_ac_kw, v.max_dc_kw, v.curve_profile`;

export async function getSessionFull(id: string) {
  return one<any>(
    `SELECT ${SESSION_COLUMNS}, (SELECT json_agg(json_build_object('ts', ts, 'energyKwh', energy_kwh, 'powerKw', power_kw, 'soc', soc) ORDER BY ts)
              FROM session_meter_values WHERE session_id = cs.id) AS meter
       FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id
       LEFT JOIN ports p ON p.id = cs.port_id LEFT JOIN user_vehicles v ON v.id = cs.vehicle_id
      WHERE cs.id = $1`,
    [id],
  );
}

export async function startSession(
  user: AuthUser,
  input: { portId: string; vehicleId: string; startSoc?: number; targetSoc: number; paymentMethodId?: string | null; reservationId?: string | null },
) {
  const port = await one<any>(
    `SELECT p.*, s.integration_type, s.name AS station_name, s.listing_status, s.maintenance_mode, s.id AS sid,
            (SELECT id FROM charge_points WHERE station_id = s.id ORDER BY created_at LIMIT 1) AS charge_point_id,
            COALESCE(pt.config, t.config) AS tariff_config
       FROM ports p JOIN stations s ON s.id = p.station_id
       LEFT JOIN tariffs t ON t.id = s.tariff_id LEFT JOIN tariffs pt ON pt.id = p.tariff_id
      WHERE p.id = $1`,
    [input.portId],
  );
  if (!port) throw notFound('Charging port not found');
  if (port.listing_status !== 'approved' || port.maintenance_mode) throw conflict('This station is not accepting sessions right now');
  const controller = controllerFor(port.integration_type);
  if (!controller)
    throw notImplemented('This station does not support starting sessions from the app yet. Start charging at the charger using its own payment options.');
  if (port.integration_type === 'ocpp' && !isChargePointConnected(port.charge_point_id))
    throw conflict('The charger is not connected right now. Try again shortly or start at the charger.');

  const vehicle = await one<any>('SELECT * FROM user_vehicles WHERE id = $1 AND user_id = $2', [input.vehicleId, user.id]);
  if (!vehicle) throw badRequest('Choose one of your vehicles');
  if (!vehicle.connectors.includes(port.connector_type))
    throw badRequest(`Your ${vehicle.brand} ${vehicle.model} is not compatible with ${port.connector_type}`);

  // Port must be free, or reserved by this user right now.
  let reservationId: string | null = null;
  if (port.status === 'reserved') {
    const r = await one<any>(
      `SELECT id FROM reservations WHERE port_id = $1 AND user_id = $2 AND status IN ('confirmed','active')
         AND start_at <= now() + interval '15 minutes' AND end_at > now()`,
      [port.id, user.id],
    );
    if (!r) throw conflict('This port is reserved by another driver');
    reservationId = r.id;
  } else if (port.status !== 'available') {
    throw conflict(`This port is currently ${port.status.replace(/_/g, ' ')}`);
  }

  const active = await one('SELECT id FROM charging_sessions WHERE user_id = $1 AND status IN (\'pending\',\'active\')', [user.id]);
  if (active) throw conflict('You already have a charging session in progress');

  const startSoc = input.startSoc ?? vehicle.current_soc;
  if (input.targetSoc <= startSoc) throw badRequest('Target must be above your current battery level');
  const currency = normalizeTariff(port.tariff_config).currency;
  let paymentMethodId = input.paymentMethodId ?? null;
  if (!paymentMethodId) {
    paymentMethodId = (await one<any>('SELECT id FROM payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at LIMIT 1', [user.id]))?.id ?? null;
  }

  const session = await tx(async (c) => {
    const s = await one<any>(
      `INSERT INTO charging_sessions(user_id, station_id, port_id, vehicle_id, reservation_id, payment_method_id, status, control_source,
                                     start_soc, current_soc, target_soc, currency, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$8,$9,$10,$11) RETURNING *`,
      [user.id, port.sid, port.id, vehicle.id, reservationId ?? input.reservationId ?? null, paymentMethodId,
       port.integration_type, startSoc, input.targetSoc, currency, port.integration_type === 'simulator'],
      c,
    );
    if (reservationId) await c.query(`UPDATE reservations SET status = 'active' WHERE id = $1`, [reservationId]);
    return s;
  });

  try {
    await controller.start({
      sessionId: session.id, portId: port.id, stationId: port.sid, idTag: idTagFor(user.id),
      ocppConnectorId: port.ocpp_connector_id, chargePointId: port.charge_point_id,
    });
  } catch (e) {
    await q(`UPDATE charging_sessions SET status = 'failed', ended_at = now() WHERE id = $1`, [session.id]);
    throw conflict(`The charger rejected the start request: ${(e as Error).message}`);
  }
  return getSessionFull(session.id);
}

export function idTagFor(userId: string) {
  return userId.replace(/-/g, '').slice(0, 20).toUpperCase();
}

export async function activateSession(sessionId: string, extra: { ocppTransactionId?: number } = {}) {
  const s = await one<any>(
    `UPDATE charging_sessions SET status = 'active', started_at = now(), ocpp_transaction_id = COALESCE($2, ocpp_transaction_id)
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [sessionId, extra.ocppTransactionId ?? null],
  );
  if (!s) return null;
  await setPortStatus(s.port_id, 'charging', s.control_source === 'ocpp' ? 'live' : 'simulated');
  emitSession(s);
  return s;
}

export async function recordMeter(sessionId: string, m: { energyKwh: number; powerKw: number; soc?: number | null }, persistSample = true) {
  const s = await one<any>(
    `UPDATE charging_sessions SET energy_kwh = $2, power_kw = $3, current_soc = COALESCE($4, current_soc)
      WHERE id = $1 AND status = 'active' RETURNING *`,
    [sessionId, round(m.energyKwh, 3), round(m.powerKw, 2), m.soc ?? null],
  );
  if (!s) return null;
  if (persistSample)
    await q('INSERT INTO session_meter_values(session_id, energy_kwh, power_kw, soc) VALUES ($1,$2,$3,$4)', [sessionId, s.energy_kwh, s.power_kw, s.current_soc]);
  emitSession(s);
  return s;
}

function emitSession(s: any) {
  const data = {
    id: s.id, status: s.status, energyKwh: s.energy_kwh, powerKw: s.power_kw, currentSoc: s.current_soc, targetSoc: s.target_soc,
    startedAt: s.started_at, endedAt: s.ended_at, costTotal: s.cost_total, currency: s.currency,
  };
  publish(`session:${s.id}`, 'session.update', data);
  if (s.user_id) publishToUser(s.user_id, 'session.update', data);
}

/** Close a session: price it from meter samples, invoice it, take payment, free the port, notify the driver. */
export async function finalizeSession(sessionId: string, status: 'completed' | 'stopped' | 'failed' = 'completed') {
  const s = await one<any>(
    `SELECT cs.*, COALESCE(pt.config, t.config) AS tariff_config, st.timezone, st.name AS station_name, st.company_id
       FROM charging_sessions cs JOIN stations st ON st.id = cs.station_id
       LEFT JOIN ports p ON p.id = cs.port_id
       LEFT JOIN tariffs t ON t.id = st.tariff_id LEFT JOIN tariffs pt ON pt.id = p.tariff_id
      WHERE cs.id = $1`,
    [sessionId],
  );
  if (!s || !['active', 'pending'].includes(s.status)) return null;
  const samples = await q<{ ts: string; energy_kwh: number }>('SELECT ts, energy_kwh FROM session_meter_values WHERE session_id = $1 ORDER BY ts', [sessionId]);
  const chunks: { kwh: number; at: Date }[] = [];
  let prev = 0;
  for (const m of samples) {
    chunks.push({ kwh: Math.max(0, m.energy_kwh - prev), at: new Date(m.ts) });
    prev = m.energy_kwh;
  }
  if (s.energy_kwh > prev) chunks.push({ kwh: s.energy_kwh - prev, at: new Date() });
  const durationMin = (Date.now() - new Date(s.started_at).getTime()) / 60_000;
  const breakdown = costForEnergyChunks(normalizeTariff(s.tariff_config), chunks, durationMin, s.timezone);
  const finalStatus = s.status === 'pending' ? 'failed' : status;

  const updated = await one<any>(
    `UPDATE charging_sessions SET status = $2, ended_at = now(), power_kw = 0, cost_total = $3, cost_breakdown = $4
      WHERE id = $1 RETURNING *`,
    [sessionId, finalStatus, finalStatus === 'failed' ? 0 : breakdown.total, breakdown],
  );
  if (s.reservation_id) await q(`UPDATE reservations SET status = 'completed' WHERE id = $1`, [s.reservation_id]);
  if (s.port_id) await setPortStatus(s.port_id, 'available', s.control_source === 'ocpp' ? 'live' : 'simulated');

  if (s.user_id && finalStatus !== 'failed' && breakdown.total > 0) {
    const pm = s.payment_method_id ? await one<any>('SELECT * FROM payment_methods WHERE id = $1', [s.payment_method_id]) : null;
    const provider = paymentProvider();
    const charge = await provider.charge({
      amount: breakdown.total, currency: breakdown.currency, paymentMethod: pm,
      description: `Charging at ${s.station_name}`, metadata: { sessionId },
    });
    await q(
      `INSERT INTO invoices(number, session_id, user_id, company_id, amount, currency, breakdown, payment_status, payment_provider, provider_ref)
       VALUES ('WT-' || nextval('invoice_number_seq'), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [sessionId, s.user_id, s.company_id, breakdown.total, breakdown.currency, { ...breakdown, demo: provider.isDemo, paymentMethod: pm?.label ?? null },
       charge.status === 'paid' ? 'paid' : charge.status === 'failed' ? 'failed' : 'pending', charge.provider, charge.ref],
    );
  }
  if (s.user_id) {
    await q('UPDATE user_vehicles SET current_soc = $2 WHERE id = $1', [s.vehicle_id, Math.round(updated.current_soc ?? s.current_soc ?? 0)]);
    if (finalStatus !== 'failed')
      await notify(s.user_id, 'session_complete', finalStatus === 'completed' ? 'Charging complete' : 'Charging stopped',
        `${s.station_name}: ${round(updated.energy_kwh, 1)} kWh delivered, battery at ${Math.round(updated.current_soc)}%. Total ${breakdown.currency} ${breakdown.total.toLocaleString()}.`,
        { sessionId }, `session:${sessionId}`);
  }
  emitSession(updated);
  return updated;
}

export async function stopSession(user: AuthUser, sessionId: string) {
  const s = await one<any>('SELECT cs.*, st.integration_type FROM charging_sessions cs JOIN stations st ON st.id = cs.station_id WHERE cs.id = $1', [sessionId]);
  if (!s) throw notFound('Session not found');
  if (s.user_id !== user.id && user.role !== 'admin') throw forbidden();
  if (!['active', 'pending'].includes(s.status)) throw conflict('This session has already ended');
  const controller = controllerFor(s.integration_type);
  if (controller) await controller.stop(sessionId);
  // OCPP sessions finalize on StopTransaction; simulator sessions finalize immediately.
  if (s.integration_type !== 'ocpp') await finalizeSession(sessionId, 'stopped');
  return getSessionFull(sessionId);
}

export function vehicleCompatibleCurrent(connectors: ConnectorType[]) {
  return [...new Set(connectors.map((c) => CONNECTOR_CURRENT[c]))];
}
