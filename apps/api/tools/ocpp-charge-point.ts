// Minimal OCPP 1.6J charge point emulator for testing the central system.
// Usage: npx tsx tools/ocpp-charge-point.ts <identity> [ws://localhost:4000] [connectors=5]
// Responds to RemoteStart/RemoteStop/ReserveNow and streams MeterValues while charging.
import WebSocket from 'ws';

const [identity = 'AMPWAY-RAVI-01', base = 'ws://localhost:4000', nStr = '5'] = process.argv.slice(2);
const connectors = Number(nStr);
const ws = new WebSocket(`${base}/ocpp/${identity}`, ['ocpp1.6']);
let seq = 0;
const pending = new Map<string, (p: any) => void>();
const call = (action: string, payload: any) =>
  new Promise<any>((resolve) => {
    const id = `cp${++seq}`;
    pending.set(id, resolve);
    ws.send(JSON.stringify([2, id, action, payload]));
  });
const tx: Record<number, { id: number; wh: number; timer: NodeJS.Timeout }> = {};

async function startTx(connectorId: number, idTag: string) {
  await call('StatusNotification', { connectorId, status: 'Preparing', errorCode: 'NoError' });
  const res = await call('StartTransaction', { connectorId, idTag, meterStart: 0, timestamp: new Date().toISOString() });
  await call('StatusNotification', { connectorId, status: 'Charging', errorCode: 'NoError' });
  const t = { id: res.transactionId, wh: 0, timer: setInterval(async () => {
    t.wh += 1500;
    await call('MeterValues', { connectorId, transactionId: t.id, meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [
      { value: String(t.wh), measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
      { value: '92000', measurand: 'Power.Active.Import', unit: 'W' },
    ] }] });
  }, 2000) };
  tx[connectorId] = t;
  console.log(`▶ transaction ${t.id} on connector ${connectorId}`);
}

async function stopTx(transactionId: number) {
  const entry = Object.entries(tx).find(([, t]) => t.id === transactionId);
  if (!entry) return;
  const [cid, t] = entry;
  clearInterval(t.timer);
  await call('StopTransaction', { transactionId, meterStop: t.wh, timestamp: new Date().toISOString(), reason: 'Remote' });
  await call('StatusNotification', { connectorId: Number(cid), status: 'Available', errorCode: 'NoError' });
  delete tx[Number(cid)];
  console.log(`■ transaction ${transactionId} stopped at ${t.wh} Wh`);
}

ws.on('open', async () => {
  console.log(`connected as ${identity}`);
  const boot = await call('BootNotification', { chargePointVendor: 'WattlyDev', chargePointModel: 'Emu-DC150', firmwareVersion: '1.0.0' });
  console.log('BootNotification →', boot.status);
  for (let c = 1; c <= connectors; c++) await call('StatusNotification', { connectorId: c, status: 'Available', errorCode: 'NoError' });
  setInterval(() => call('Heartbeat', {}), 60_000);
});

ws.on('message', async (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg[0] === 3) { pending.get(msg[1])?.(msg[2]); pending.delete(msg[1]); return; }
  if (msg[0] !== 2) return;
  const [, id, action, p] = msg;
  console.log('⇠', action, JSON.stringify(p));
  switch (action) {
    case 'RemoteStartTransaction':
      ws.send(JSON.stringify([3, id, { status: 'Accepted' }]));
      setTimeout(() => startTx(p.connectorId ?? 1, p.idTag), 500);
      break;
    case 'RemoteStopTransaction':
      ws.send(JSON.stringify([3, id, { status: 'Accepted' }]));
      setTimeout(() => stopTx(p.transactionId), 500);
      break;
    case 'ReserveNow':
      ws.send(JSON.stringify([3, id, { status: 'Accepted' }]));
      await call('StatusNotification', { connectorId: p.connectorId, status: 'Reserved', errorCode: 'NoError' });
      break;
    default:
      ws.send(JSON.stringify([3, id, { status: 'Accepted' }]));
  }
});
ws.on('close', (code, reason) => { console.log('closed', code, String(reason)); process.exit(0); });
ws.on('error', (e) => { console.error(e.message); process.exit(1); });
