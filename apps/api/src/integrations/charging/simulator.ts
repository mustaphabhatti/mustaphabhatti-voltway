// ─────────────────────────────────────────────────────────────────────────────
// DEMO charger simulator.
// • Drives charging sessions for stations whose integration_type = 'simulator'.
// • Produces a demo availability feed (random but plausible status changes).
// Everything it produces is tagged source = 'simulated' and labelled as demo
// data in the UI. It is never presented as live information.
// ─────────────────────────────────────────────────────────────────────────────
import { vehicleAcceptanceKw, temperatureFactor, chargingEfficiency, type PortStatus } from '@wattly/shared';
import { config } from '../../config';
import { q } from '../../db';
import type { ChargingController } from './types';

interface SimSession {
  id: string;
  soc: number;
  target: number;
  energyKwh: number; // metered (from charger)
  batteryKwh: number;
  maxAcKw: number;
  maxDcKw: number;
  curveProfile: any;
  chargerKw: number;
  currentType: 'AC' | 'DC';
  lastTick: number;
  ticks: number;
}

const sims = new Map<string, SimSession>();
let sessionTimer: NodeJS.Timeout | null = null;
let feedTimer: NodeJS.Timeout | null = null;

async function loadSim(sessionId: string): Promise<SimSession | null> {
  const [r] = await q<any>(
    `SELECT cs.id, cs.current_soc, cs.target_soc, cs.energy_kwh, v.battery_kwh, v.max_ac_kw, v.max_dc_kw, v.curve_profile,
            p.max_power_kw, p.current_type
       FROM charging_sessions cs JOIN user_vehicles v ON v.id = cs.vehicle_id JOIN ports p ON p.id = cs.port_id
      WHERE cs.id = $1`,
    [sessionId],
  );
  if (!r) return null;
  return {
    id: r.id, soc: Number(r.current_soc), target: Number(r.target_soc), energyKwh: Number(r.energy_kwh),
    batteryKwh: Number(r.battery_kwh), maxAcKw: Number(r.max_ac_kw), maxDcKw: Number(r.max_dc_kw), curveProfile: r.curve_profile,
    chargerKw: Number(r.max_power_kw), currentType: r.current_type, lastTick: Date.now(), ticks: 0,
  };
}

async function tick() {
  const { recordMeter, finalizeSession } = await import('../../services/sessions');
  for (const s of sims.values()) {
    const now = Date.now();
    const simHours = ((now - s.lastTick) / 3_600_000) * config.demoSessionSpeed;
    s.lastTick = now;
    s.ticks++;
    const accept = vehicleAcceptanceKw(
      { batteryKwh: s.batteryKwh, maxAcKw: s.maxAcKw, maxDcKw: s.maxDcKw, curveProfile: s.curveProfile },
      s.currentType, s.soc,
    ) * temperatureFactor(null, s.currentType);
    const power = Math.max(0.5, Math.min(s.chargerKw * (s.currentType === 'DC' ? 0.95 : 0.97), accept)) * (0.97 + Math.random() * 0.04);
    const eff = chargingEfficiency(s.currentType);
    const batteryKwh = power * simHours;
    s.soc = Math.min(s.target, s.soc + (batteryKwh / s.batteryKwh) * 100);
    s.energyKwh += batteryKwh / eff;
    await recordMeter(s.id, { energyKwh: s.energyKwh, powerKw: power, soc: Math.round(s.soc * 10) / 10 }, s.ticks % 3 === 0);
    if (s.soc >= s.target - 0.05) {
      sims.delete(s.id);
      await finalizeSession(s.id, 'completed');
    }
  }
}

export const simulatorController: ChargingController = {
  kind: 'simulator',
  async start(cmd) {
    const { activateSession } = await import('../../services/sessions');
    await activateSession(cmd.sessionId);
    const sim = await loadSim(cmd.sessionId);
    if (sim) sims.set(sim.id, sim);
  },
  async stop(sessionId) {
    sims.delete(sessionId);
  },
  async reserve() {
    /* simulator accepts every reservation */
  },
  async cancelReservation() {},
};

/** Random-but-plausible availability changes for demo stations. */
async function feedTick() {
  const { setPortStatus } = await import('../../services/portStatus');
  const ports = await q<{ id: string; status: PortStatus }>(
    `SELECT p.id, p.status FROM ports p JOIN stations s ON s.id = p.station_id
      WHERE s.integration_type = 'simulator' AND s.listing_status = 'approved' AND NOT s.maintenance_mode AND p.is_active
        AND NOT EXISTS (SELECT 1 FROM charging_sessions cs WHERE cs.port_id = p.id AND cs.status IN ('pending','active'))
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.port_id = p.id AND r.status IN ('confirmed','active') AND r.end_at > now())
      ORDER BY random() LIMIT 3`,
  );
  for (const p of ports) {
    const r = Math.random();
    let next: PortStatus = p.status;
    switch (p.status) {
      case 'available': next = r < 0.55 ? 'charging' : r < 0.6 ? 'occupied' : r < 0.62 ? 'offline' : 'available'; break;
      case 'charging': next = r < 0.5 ? 'available' : r < 0.6 ? 'occupied' : 'charging'; break;
      case 'occupied': next = r < 0.6 ? 'available' : 'occupied'; break;
      case 'offline':
      case 'out_of_service':
      case 'unknown': next = r < 0.35 ? 'available' : p.status; break;
      case 'no_power': next = r < 0.15 ? 'available' : 'no_power'; break;
      default: next = 'available';
    }
    if (next !== p.status) await setPortStatus(p.id, next, 'simulated');
  }
}

export async function startSimulator(log: (m: string) => void) {
  // Resume sessions left active by a restart.
  const active = await q<{ id: string }>(`SELECT cs.id FROM charging_sessions cs JOIN stations s ON s.id = cs.station_id
                                           WHERE cs.status = 'active' AND s.integration_type = 'simulator'`);
  for (const a of active) {
    const sim = await loadSim(a.id);
    if (sim) sims.set(sim.id, sim);
  }
  sessionTimer = setInterval(() => tick().catch((e) => log(`simulator tick failed: ${e.message}`)), 2000);
  if (config.demoSimulator) feedTimer = setInterval(() => feedTick().catch((e) => log(`demo feed failed: ${e.message}`)), 12_000);
  log(`Demo simulator running (sessions ×${config.demoSessionSpeed}${config.demoSimulator ? ', availability feed on' : ''}); resumed ${active.length} session(s)`);
}

export function stopSimulator() {
  if (sessionTimer) clearInterval(sessionTimer);
  if (feedTimer) clearInterval(feedTimer);
}

export function activeSimulatedSessions() {
  return sims.size;
}
