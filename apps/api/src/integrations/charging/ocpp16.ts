// ─────────────────────────────────────────────────────────────────────────────
// OCPP 1.6J central system (WebSocket, sub-protocol "ocpp1.6").
// Charge points connect to  ws(s)://<api>/ocpp/<chargePointIdentity>
// and must be registered in `charge_points` (or OCPP_AUTO_ACCEPT=true in dev).
// Status received here is stored with source = 'live'.
// ─────────────────────────────────────────────────────────────────────────────
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import bcrypt from 'bcryptjs';
import { ocppStatusToPortStatus } from '@wattly/shared';
import { config } from '../../config';
import { q, one } from '../../db';
import type { ChargingController } from './types';

type Call = [2, string, string, any];
type CallResult = [3, string, any];
type CallError = [4, string, string, string, any];

interface Connection {
  id: string;
  stationId: string;
  ws: WebSocket;
  pending: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
}

const connections = new Map<string, Connection>();

export function isChargePointConnected(id: string | null | undefined) {
  return !!id && connections.get(id)?.ws.readyState === 1;
}

export function connectedChargePoints() {
  return [...connections.keys()];
}

function send(conn: Connection, action: string, payload: any, timeoutMs = 20_000): Promise<any> {
  const id = Math.random().toString(36).slice(2, 12);
  const msg: Call = [2, id, action, payload];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error(`${action} timed out`));
    }, timeoutMs);
    conn.pending.set(id, { resolve, reject, timer });
    conn.ws.send(JSON.stringify(msg));
  });
}

async function portFor(stationId: string, connectorId: number) {
  return one<any>('SELECT id FROM ports WHERE station_id = $1 AND ocpp_connector_id = $2', [stationId, connectorId]);
}

async function handleCall(conn: Connection, action: string, p: any): Promise<any> {
  const { setPortStatus } = await import('../../services/portStatus');
  const sessions = await import('../../services/sessions');
  const now = new Date().toISOString();
  switch (action) {
    case 'BootNotification':
      await q(
        `UPDATE charge_points SET vendor = $2, model = $3, serial_number = $4, firmware = $5, last_boot_at = now(), connected = true WHERE id = $1`,
        [conn.id, p.chargePointVendor, p.chargePointModel, p.chargePointSerialNumber ?? null, p.firmwareVersion ?? null],
      );
      return { status: 'Accepted', currentTime: now, interval: 300 };
    case 'Heartbeat':
      await q('UPDATE charge_points SET last_heartbeat_at = now() WHERE id = $1', [conn.id]);
      return { currentTime: now };
    case 'StatusNotification': {
      if (p.connectorId === 0) {
        // connector 0 = whole charge point
        if (p.status === 'Unavailable' || p.status === 'Faulted') {
          const ports = await q<{ id: string }>('SELECT id FROM ports WHERE station_id = $1 AND ocpp_connector_id IS NOT NULL', [conn.stationId]);
          for (const port of ports) await setPortStatus(port.id, ocppStatusToPortStatus(p.status, p.errorCode), 'live');
        }
        return {};
      }
      const port = await portFor(conn.stationId, p.connectorId);
      if (port) await setPortStatus(port.id, ocppStatusToPortStatus(p.status, p.errorCode), 'live');
      return {};
    }
    case 'Authorize':
      return { idTagInfo: { status: 'Accepted' } };
    case 'StartTransaction': {
      const port = await portFor(conn.stationId, p.connectorId);
      const txId = (await one<{ id: number }>("SELECT nextval('ocpp_transaction_seq')::int AS id"))!.id;
      // Match a pending app-initiated session on this port, otherwise record an anonymous session.
      const pending = port
        ? await one<any>(`SELECT id FROM charging_sessions WHERE port_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, [port.id])
        : null;
      if (pending) await sessions.activateSession(pending.id, { ocppTransactionId: txId });
      else if (port)
        await q(
          `INSERT INTO charging_sessions(station_id, port_id, status, control_source, ocpp_transaction_id, started_at)
           VALUES ($1,$2,'active','ocpp',$3,$4)`,
          [conn.stationId, port.id, txId, p.timestamp ?? now],
        );
      return { transactionId: txId, idTagInfo: { status: 'Accepted' } };
    }
    case 'MeterValues': {
      if (!p.transactionId) return {};
      const s = await one<any>('SELECT id, energy_kwh FROM charging_sessions WHERE ocpp_transaction_id = $1', [p.transactionId]);
      if (!s) return {};
      let energy: number | null = null, power: number | null = null, soc: number | null = null;
      for (const mv of p.meterValue ?? [])
        for (const sv of mv.sampledValue ?? []) {
          const v = Number(sv.value);
          const unit = sv.unit ?? 'Wh';
          switch (sv.measurand ?? 'Energy.Active.Import.Register') {
            case 'Energy.Active.Import.Register': energy = unit === 'kWh' ? v : v / 1000; break;
            case 'Power.Active.Import': power = unit === 'kW' ? v : v / 1000; break;
            case 'SoC': soc = v; break;
          }
        }
      await sessions.recordMeter(s.id, { energyKwh: energy ?? s.energy_kwh, powerKw: power ?? 0, soc });
      return {};
    }
    case 'StopTransaction': {
      const s = await one<any>('SELECT id FROM charging_sessions WHERE ocpp_transaction_id = $1', [p.transactionId]);
      if (s) {
        if (p.meterStop != null) await q('UPDATE charging_sessions SET energy_kwh = $2 WHERE id = $1', [s.id, Number(p.meterStop) / 1000]);
        await sessions.finalizeSession(s.id, p.reason === 'Local' || p.reason === 'EVDisconnected' ? 'completed' : 'stopped');
      }
      return { idTagInfo: { status: 'Accepted' } };
    }
    case 'DataTransfer':
      return { status: 'Accepted' };
    case 'DiagnosticsStatusNotification':
    case 'FirmwareStatusNotification':
      return {};
    default:
      throw Object.assign(new Error(`Action ${action} not supported`), { code: 'NotImplemented' });
  }
}

export async function registerOcpp(app: FastifyInstance) {
  app.get('/ocpp/:id', { websocket: true }, async (socket, req) => {
    const id = (req.params as any).id as string;
    // Attach listeners synchronously so nothing sent right after the handshake is lost.
    const early: string[] = [];
    let conn: Connection | null = null;
    let closed = false;
    const onMessage = async (raw: string) => {
      if (!conn) return void early.push(raw);
      let msg: Call | CallResult | CallError;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg[0] === 2) {
        const [, uid, action, payload] = msg;
        try {
          const result = await handleCall(conn, action, payload ?? {});
          socket.send(JSON.stringify([3, uid, result]));
        } catch (e: any) {
          socket.send(JSON.stringify([4, uid, e.code ?? 'InternalError', e.message, {}]));
        }
      } else if (msg[0] === 3 || msg[0] === 4) {
        const pending = conn.pending.get(msg[1]);
        if (!pending) return;
        clearTimeout(pending.timer);
        conn.pending.delete(msg[1]);
        if (msg[0] === 3) pending.resolve(msg[2]);
        else pending.reject(new Error(`${msg[2]}: ${msg[3]}`));
      }
    };
    socket.on('message', (raw) => void onMessage(String(raw)));
    socket.on('close', async () => {
      closed = true;
      if (!conn) return;
      if (connections.get(id) === conn) connections.delete(id);
      await q('UPDATE charge_points SET connected = false WHERE id = $1', [id]);
      // We no longer know the connectors' state.
      const { setPortStatus } = await import('../../services/portStatus');
      const ports = await q<{ id: string }>('SELECT id FROM ports WHERE station_id = $1 AND ocpp_connector_id IS NOT NULL', [conn.stationId]);
      for (const p of ports) await setPortStatus(p.id, 'offline', 'live');
      app.log.info(`OCPP: ${id} disconnected`);
    });

    const cp = await one<any>('SELECT * FROM charge_points WHERE id = $1', [id]);
    if (!cp) {
      if (config.ocppAutoAccept) app.log.warn(`OCPP: unknown charge point ${id} — register it on a station first`);
      socket.close(1008, 'Unknown charge point');
      return;
    }
    // Security profile 1: HTTP Basic auth (password stored hashed).
    if (cp.password_hash) {
      const auth = req.headers.authorization ?? '';
      const [, b64] = auth.split(' ');
      const [, pass] = Buffer.from(b64 ?? '', 'base64').toString().split(':');
      if (!pass || !(await bcrypt.compare(pass, cp.password_hash))) {
        socket.close(1008, 'Unauthorized');
        return;
      }
    }
    if (closed) return;
    await q('UPDATE charge_points SET connected = true WHERE id = $1', [id]);
    await q(`UPDATE stations SET integration_type = 'ocpp' WHERE id = $1 AND integration_type = 'none'`, [cp.station_id]);
    conn = { id, stationId: cp.station_id, ws: socket, pending: new Map() };
    connections.set(id, conn);
    app.log.info(`OCPP: ${id} connected`);
    for (const m of early.splice(0)) await onMessage(m);
  });
}

function conn(chargePointId: string | null) {
  const c = chargePointId ? connections.get(chargePointId) : undefined;
  if (!c) throw new Error('charger not connected');
  return c;
}

export const ocppController: ChargingController = {
  kind: 'ocpp',
  async start(cmd) {
    const res = await send(conn(cmd.chargePointId), 'RemoteStartTransaction', { connectorId: cmd.ocppConnectorId ?? 1, idTag: cmd.idTag });
    if (res.status !== 'Accepted') throw new Error('RemoteStartTransaction rejected');
  },
  async stop(sessionId) {
    const s = await one<any>(
      `SELECT cs.ocpp_transaction_id, (SELECT id FROM charge_points WHERE station_id = cs.station_id LIMIT 1) cp
         FROM charging_sessions cs WHERE cs.id = $1`,
      [sessionId],
    );
    if (!s?.ocpp_transaction_id) throw new Error('No transaction to stop');
    const res = await send(conn(s.cp), 'RemoteStopTransaction', { transactionId: s.ocpp_transaction_id });
    if (res.status !== 'Accepted') throw new Error('RemoteStopTransaction rejected');
  },
  async reserve(a) {
    const res = await send(conn(a.chargePointId), 'ReserveNow', {
      connectorId: a.ocppConnectorId ?? 1, expiryDate: a.expiresAt.toISOString(), idTag: a.idTag,
      reservationId: parseInt(a.reservationId.replace(/-/g, '').slice(0, 7), 16),
    });
    if (res.status !== 'Accepted') throw new Error(`ReserveNow ${res.status}`);
  },
  async cancelReservation(a) {
    await send(conn(a.chargePointId), 'CancelReservation', { reservationId: parseInt(a.reservationId.replace(/-/g, '').slice(0, 7), 16) });
  },
};
