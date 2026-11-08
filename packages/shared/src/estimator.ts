// ─────────────────────────────────────────────────────────────────────────────
// Charging time / energy / cost estimator.
//
// Model:
//  • Power actually delivered = min(charger capability, vehicle capability at
//    the current SoC) × temperature factor. A charger's rated power is never
//    assumed to be delivered as-is.
//  • DC: the vehicle's charging curve tapers with SoC (profile-dependent).
//  • AC: on-board charger limit, light taper above ~92 % SoC.
//  • Energy drawn from the charger (billed) > energy stored in the battery,
//    because of conversion / thermal losses (efficiency).
//  • Cost integrates the tariff over time, so a session that crosses into a
//    peak window is priced correctly.
// ─────────────────────────────────────────────────────────────────────────────

import type { CurrentType, CurveProfile } from './types';
import { costForEnergyChunks, type CostBreakdown, type Tariff, round } from './pricing';

export interface CurvePoint {
  soc: number; // %
  fraction: number; // share of the vehicle's peak DC power
}

/** Typical DC charging curves (fraction of peak power vs SoC). */
export const CURVE_PROFILES: Record<CurveProfile, { label: string; points: CurvePoint[] }> = {
  standard_400v: {
    label: 'Typical 400 V NMC',
    points: [
      { soc: 0, fraction: 0.7 },
      { soc: 10, fraction: 0.95 },
      { soc: 20, fraction: 1.0 },
      { soc: 35, fraction: 0.95 },
      { soc: 50, fraction: 0.8 },
      { soc: 60, fraction: 0.66 },
      { soc: 70, fraction: 0.52 },
      { soc: 80, fraction: 0.38 },
      { soc: 90, fraction: 0.2 },
      { soc: 95, fraction: 0.12 },
      { soc: 100, fraction: 0.05 },
    ],
  },
  flat_800v: {
    label: '800 V architecture (flat curve)',
    points: [
      { soc: 0, fraction: 0.8 },
      { soc: 10, fraction: 1.0 },
      { soc: 50, fraction: 0.95 },
      { soc: 65, fraction: 0.82 },
      { soc: 75, fraction: 0.6 },
      { soc: 80, fraction: 0.45 },
      { soc: 90, fraction: 0.22 },
      { soc: 95, fraction: 0.12 },
      { soc: 100, fraction: 0.05 },
    ],
  },
  lfp: {
    label: 'LFP battery',
    points: [
      { soc: 0, fraction: 0.75 },
      { soc: 10, fraction: 1.0 },
      { soc: 40, fraction: 0.92 },
      { soc: 60, fraction: 0.75 },
      { soc: 80, fraction: 0.5 },
      { soc: 90, fraction: 0.3 },
      { soc: 95, fraction: 0.18 },
      { soc: 100, fraction: 0.08 },
    ],
  },
  legacy: {
    label: 'Early-generation EV',
    points: [
      { soc: 0, fraction: 0.85 },
      { soc: 20, fraction: 1.0 },
      { soc: 50, fraction: 0.8 },
      { soc: 70, fraction: 0.5 },
      { soc: 80, fraction: 0.33 },
      { soc: 90, fraction: 0.18 },
      { soc: 100, fraction: 0.06 },
    ],
  },
};

export interface VehicleChargingProfile {
  /** Usable battery capacity in kWh. */
  batteryKwh: number;
  /** On-board AC charger limit in kW. */
  maxAcKw: number;
  /** Peak DC charging power in kW. */
  maxDcKw: number;
  curveProfile?: CurveProfile;
  curve?: CurvePoint[];
}

export interface ChargerSpec {
  powerKw: number;
  currentType: CurrentType;
  /** Fraction of rated power available, e.g. 0.5 when power is shared with an occupied neighbour. */
  availableShare?: number;
}

export interface EstimateInput {
  vehicle: VehicleChargingProfile;
  charger: ChargerSpec;
  startSoc: number;
  targetSoc: number;
  ambientTempC?: number | null;
  startTime?: Date;
  tariff?: Partial<Tariff> | null;
  timeZone?: string;
  utilization?: number;
  /** Granularity of the simulation in SoC percent. */
  stepSoc?: number;
}

export interface EstimateResult {
  durationMinutes: number;
  energyToBatteryKwh: number;
  energyFromChargerKwh: number;
  averagePowerKw: number;
  peakPowerKw: number;
  /** Max power the charger could offer (rated × share). */
  chargerLimitKw: number;
  /** Max power the vehicle can accept on this current type. */
  vehicleLimitKw: number;
  limitingFactor: 'charger' | 'vehicle';
  efficiency: number;
  temperatureFactor: number;
  startTime: string;
  completionTime: string;
  cost: CostBreakdown | null;
  curve: { minute: number; soc: number; powerKw: number }[];
  assumptions: string[];
  warnings: string[];
}

export function curveFraction(points: CurvePoint[], soc: number): number {
  if (soc <= points[0].soc) return points[0].fraction;
  for (let i = 1; i < points.length; i++) {
    if (soc <= points[i].soc) {
      const a = points[i - 1], b = points[i];
      const t = (soc - a.soc) / (b.soc - a.soc || 1);
      return a.fraction + t * (b.fraction - a.fraction);
    }
  }
  return points[points.length - 1].fraction;
}

export function temperatureFactor(tempC: number | null | undefined, currentType: CurrentType): number {
  if (tempC == null || !Number.isFinite(tempC)) return 1;
  if (currentType === 'AC') {
    if (tempC < -10) return 0.85;
    if (tempC < 0) return 0.92;
    return 1;
  }
  if (tempC < -10) return 0.45;
  if (tempC < 0) return 0.6;
  if (tempC < 10) return 0.78;
  if (tempC < 18) return 0.92;
  if (tempC > 42) return 0.82;
  if (tempC > 35) return 0.93;
  return 1;
}

export function chargingEfficiency(currentType: CurrentType, tempC?: number | null) {
  // Grid/charger-to-battery efficiency. AC suffers on-board charger losses.
  let eff = currentType === 'DC' ? 0.93 : 0.88;
  if (tempC != null && tempC < 5) eff -= 0.04; // battery heating overhead
  return eff;
}

/** Power the vehicle accepts at a given SoC, before charger limits. */
export function vehicleAcceptanceKw(v: VehicleChargingProfile, currentType: CurrentType, soc: number): number {
  if (currentType === 'AC') {
    // AC is limited by the on-board charger; the BMS tapers near full.
    const taper = soc < 92 ? 1 : Math.max(0.3, 1 - ((soc - 92) / 8) * 0.7);
    return v.maxAcKw * taper;
  }
  const points = v.curve ?? CURVE_PROFILES[v.curveProfile ?? 'standard_400v'].points;
  return v.maxDcKw * curveFraction(points, soc);
}

/** Realistic share of rated power a DC charger delivers at the plug (cable / thermal / voltage limits). */
const DC_DELIVERY_FACTOR = 0.95;
const AC_DELIVERY_FACTOR = 0.97;

export function estimateCharging(input: EstimateInput): EstimateResult {
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const { vehicle, charger } = input;
  const startSoc = clamp(input.startSoc, 0, 100);
  const targetSoc = clamp(input.targetSoc, 0, 100);
  const startTime = input.startTime ?? new Date();
  const step = input.stepSoc ?? 0.5;
  const type = charger.currentType;
  const share = clamp(charger.availableShare ?? 1, 0.05, 1);
  const deliveryFactor = type === 'DC' ? DC_DELIVERY_FACTOR : AC_DELIVERY_FACTOR;
  const chargerLimitKw = charger.powerKw * share * deliveryFactor;
  const tf = temperatureFactor(input.ambientTempC, type);
  const eff = chargingEfficiency(type, input.ambientTempC);
  const vehicleLimitKw = type === 'DC' ? vehicle.maxDcKw : vehicle.maxAcKw;

  assumptions.push(
    `${type} charger rated ${charger.powerKw} kW; assumed up to ${round(chargerLimitKw, 1)} kW at the plug${share < 1 ? ' (shared power)' : ''}.`,
  );
  assumptions.push(`Vehicle accepts up to ${vehicleLimitKw} kW on ${type}.`);
  if (type === 'DC')
    assumptions.push(`DC power tapers with battery level (${CURVE_PROFILES[vehicle.curveProfile ?? 'standard_400v'].label} curve).`);
  assumptions.push(`Charging efficiency ≈ ${Math.round(eff * 100)} % — you pay for energy drawn, not energy stored.`);
  if (input.ambientTempC != null) assumptions.push(`Ambient temperature ${input.ambientTempC} °C (power factor ×${tf}).`);
  else assumptions.push('No temperature data — assuming a mild 20–30 °C battery.');

  if (vehicleLimitKw <= 0) {
    warnings.push(`This vehicle does not support ${type} charging.`);
  }
  if (type === 'DC' && targetSoc > 80) warnings.push('DC charging slows sharply above 80 %; consider stopping at 80 % on road trips.');
  if (type === 'AC' && charger.powerKw > vehicle.maxAcKw && vehicle.maxAcKw > 0)
    warnings.push(`Your car's on-board charger limits AC charging to ${vehicle.maxAcKw} kW (charger offers ${charger.powerKw} kW).`);
  if (type === 'DC' && charger.powerKw > vehicle.maxDcKw && vehicle.maxDcKw > 0)
    warnings.push(`Your car accepts at most ${vehicle.maxDcKw} kW DC, below this charger's ${charger.powerKw} kW rating.`);

  let minutes = 0;
  let peak = 0;
  let energyBattery = 0;
  let energyCharger = 0;
  let limitedByCharger = 0;
  const chunks: { kwh: number; at: Date }[] = [];
  const curve: EstimateResult['curve'] = [];

  if (targetSoc > startSoc && vehicleLimitKw > 0 && charger.powerKw > 0) {
    for (let soc = startSoc; soc < targetSoc - 1e-9; soc += step) {
      const ds = Math.min(step, targetSoc - soc);
      const mid = soc + ds / 2;
      const accept = vehicleAcceptanceKw(vehicle, type, mid) * tf;
      const power = Math.max(0.5, Math.min(chargerLimitKw, accept));
      if (chargerLimitKw <= accept) limitedByCharger++;
      const kwhBattery = (vehicle.batteryKwh * ds) / 100;
      const kwhCharger = kwhBattery / eff;
      const dtMin = (kwhBattery / power) * 60;
      if (curve.length === 0 || Math.floor(soc) !== Math.floor(soc - step) || soc + ds >= targetSoc - 1e-9)
        curve.push({ minute: round(minutes, 1), soc: round(soc, 1), powerKw: round(power, 1) });
      chunks.push({ kwh: kwhCharger, at: new Date(startTime.getTime() + (minutes + dtMin / 2) * 60_000) });
      minutes += dtMin;
      energyBattery += kwhBattery;
      energyCharger += kwhCharger;
      peak = Math.max(peak, power);
    }
    curve.push({ minute: round(minutes, 1), soc: targetSoc, powerKw: curve[curve.length - 1]?.powerKw ?? 0 });
  } else if (targetSoc <= startSoc) {
    warnings.push('Target battery level must be higher than the current level.');
  }

  const totalSteps = Math.max(1, Math.ceil((targetSoc - startSoc) / step));
  const cost = input.tariff
    ? costForEnergyChunks(input.tariff, chunks, minutes, input.timeZone ?? 'UTC', input.utilization)
    : null;

  return {
    durationMinutes: round(minutes, 1),
    energyToBatteryKwh: round(energyBattery, 2),
    energyFromChargerKwh: round(energyCharger, 2),
    averagePowerKw: minutes > 0 ? round(energyBattery / (minutes / 60), 1) : 0,
    peakPowerKw: round(peak, 1),
    chargerLimitKw: round(chargerLimitKw, 1),
    vehicleLimitKw,
    limitingFactor: limitedByCharger / totalSteps > 0.5 ? 'charger' : 'vehicle',
    efficiency: eff,
    temperatureFactor: tf,
    startTime: startTime.toISOString(),
    completionTime: new Date(startTime.getTime() + minutes * 60_000).toISOString(),
    cost,
    curve: thin(curve, 60),
    assumptions,
    warnings,
  };
}

/**
 * Compare starting now against later start times (every 30 min for `hours`)
 * and return the cheapest option.
 */
export function cheapestStartWindow(input: EstimateInput, hours = 24) {
  const base = input.startTime ?? new Date();
  const options: { start: string; total: number; averageRate: number; durationMinutes: number }[] = [];
  for (let i = 0; i <= hours * 2; i++) {
    const start = new Date(base.getTime() + i * 30 * 60_000);
    const r = estimateCharging({ ...input, startTime: start, stepSoc: 1 });
    if (!r.cost) break;
    options.push({ start: start.toISOString(), total: r.cost.total, averageRate: r.cost.averageRate, durationMinutes: r.durationMinutes });
  }
  if (!options.length) return null;
  const now = options[0];
  const best = options.reduce((a, b) => (b.total < a.total - 0.005 ? b : a), now);
  return {
    now,
    best,
    savings: round(now.total - best.total, 2),
    savingsPercent: now.total > 0 ? round(((now.total - best.total) / now.total) * 100, 1) : 0,
    options,
  };
}

function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const stride = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * stride)]);
  return out;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
