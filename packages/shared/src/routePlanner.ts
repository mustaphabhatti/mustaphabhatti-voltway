// ─────────────────────────────────────────────────────────────────────────────
// EV route planner — decides where and how long to charge along a route.
//
// Input: a route (length, duration) and charging candidates already projected
// onto the route (distance along the route + detour). Output: charging stops,
// SoC at every stop, charging time, cost and total trip time.
// ─────────────────────────────────────────────────────────────────────────────

import type { CurrentType } from './types';
import { estimateCharging, type VehicleChargingProfile } from './estimator';
import type { Tariff } from './pricing';
import { round } from './pricing';

export type PlanStrategy = 'fastest' | 'fewest_stops' | 'cheapest';

export const PLAN_STRATEGIES: Record<PlanStrategy, { label: string; description: string }> = {
  fastest: { label: 'Fastest trip', description: 'Short stops at high-power chargers, staying in the fast part of the curve' },
  fewest_stops: { label: 'Fewest stops', description: 'Charge higher so you stop less often' },
  cheapest: { label: 'Lowest cost', description: 'Prefers cheaper chargers when they are on the way' },
};

export interface RouteCandidate {
  stationId: string;
  portId?: string;
  name: string;
  lat: number;
  lng: number;
  alongKm: number;
  /** One-way distance from the route to the station. */
  detourKm: number;
  powerKw: number;
  currentType: CurrentType;
  pricePerKwh: number;
  currency: string;
  availablePorts: number;
  totalPorts: number;
  estimatedWaitMinutes: number;
  tariff?: Partial<Tariff> | null;
  timeZone?: string;
  operational: boolean;
}

export interface PlanInput {
  distanceKm: number;
  durationMinutes: number;
  vehicle: VehicleChargingProfile & { efficiencyWhPerKm: number };
  startSoc: number;
  minArrivalSoc: number;
  /** Maximum SoC to charge to at intermediate stops (strategy may override). */
  maxChargeSoc?: number;
  /** SoC you want when you arrive at the destination. */
  destinationSoc?: number;
  candidates: RouteCandidate[];
  strategy: PlanStrategy;
  ambientTempC?: number | null;
  departAt?: Date;
}

export interface PlannedStop {
  candidate: RouteCandidate;
  arrivalSoc: number;
  departureSoc: number;
  chargeMinutes: number;
  waitMinutes: number;
  energyKwh: number;
  cost: number | null;
  currency: string;
  arriveAt: string;
  departAt: string;
  driveKmFromPrevious: number;
}

export interface PlanResult {
  strategy: PlanStrategy;
  feasible: boolean;
  stops: PlannedStop[];
  arrivalSoc: number;
  consumptionWhPerKm: number;
  energyUsedKwh: number;
  driveMinutes: number;
  chargeMinutes: number;
  waitMinutes: number;
  totalMinutes: number;
  totalChargingCost: Record<string, number>;
  arriveAt: string;
  warnings: string[];
  notes: string[];
}

/** Adjusted consumption for the route: highway speed and temperature effects. */
export function routeConsumption(baseWhPerKm: number, avgSpeedKmh: number, tempC?: number | null) {
  let f = 1;
  if (avgSpeedKmh > 95) f *= 1.18;
  else if (avgSpeedKmh > 75) f *= 1.08;
  else if (avgSpeedKmh < 35) f *= 0.95;
  if (tempC != null) {
    if (tempC < 0) f *= 1.3;
    else if (tempC < 10) f *= 1.15;
    else if (tempC > 35) f *= 1.1;
  }
  return round(baseWhPerKm * f, 0);
}

export function planRoute(input: PlanInput): PlanResult {
  const warnings: string[] = [];
  const notes: string[] = [];
  const v = input.vehicle;
  const avgSpeed = input.durationMinutes > 0 ? input.distanceKm / (input.durationMinutes / 60) : 60;
  const whPerKm = routeConsumption(v.efficiencyWhPerKm, avgSpeed, input.ambientTempC);
  const socPerKm = (whPerKm / 1000 / v.batteryKwh) * 100;
  const minArrival = input.minArrivalSoc;
  const destSoc = Math.max(minArrival, input.destinationSoc ?? minArrival);
  const maxSoc =
    input.maxChargeSoc ?? (input.strategy === 'fewest_stops' ? 90 : input.strategy === 'fastest' ? 80 : 85);
  const kmPerMin = input.distanceKm / Math.max(1, input.durationMinutes);
  const detourSpeedKmPerMin = 0.6; // ~36 km/h on local roads to reach the charger
  const departAt = input.departAt ?? new Date();

  notes.push(`Consumption estimated at ${whPerKm} Wh/km (avg ${Math.round(avgSpeed)} km/h${input.ambientTempC != null ? `, ${input.ambientTempC} °C` : ''}).`);

  const compatible = input.candidates
    .filter((c) => c.operational && c.powerKw > 0)
    .filter((c) => (c.currentType === 'DC' ? v.maxDcKw > 0 : v.maxAcKw > 0))
    .sort((a, b) => a.alongKm - b.alongKm);

  let pos = 0;
  let soc = input.startSoc;
  let clock = departAt.getTime();
  let driveMin = 0;
  let chargeMin = 0;
  let waitMin = 0;
  let energyUsed = 0;
  const costs: Record<string, number> = {};
  const stops: PlannedStop[] = [];
  let feasible = true;
  const visited = new Set<string>();
  // Re-join point after the previous stop (detour back to route is added to the next leg).
  let pendingDetourKm = 0;

  for (let guard = 0; guard < 12; guard++) {
    const remainingKm = input.distanceKm - pos + pendingDetourKm;
    const socAtDest = soc - remainingKm * socPerKm;
    if (socAtDest >= destSoc) break;

    // Which stations can we reach while keeping the reserve?
    const reachable = compatible.filter((c) => {
      if (visited.has(c.stationId) || c.alongKm <= pos + 0.5) return false;
      const km = c.alongKm - pos + pendingDetourKm + c.detourKm;
      return soc - km * socPerKm >= minArrival - 0.01;
    });
    if (!reachable.length) {
      feasible = false;
      warnings.push(
        stops.length === 0
          ? 'No compatible charging station is reachable with the current battery level. Charge before departing.'
          : 'No compatible charger found within range for the next leg — this route cannot be completed with known stations.',
      );
      break;
    }
    // Narrow the choice: on long trips prefer DC fast chargers, and avoid stopping too early.
    const effPower = (c: RouteCandidate) => Math.min(c.powerKw, c.currentType === 'DC' ? v.maxDcKw : v.maxAcKw);
    let pool = reachable;
    if (input.distanceKm > 100) {
      const fast = pool.filter((c) => effPower(c) >= 40);
      if (fast.length) pool = fast;
    }
    const reach = Math.max(...pool.map((c) => c.alongKm)) - pos;
    const minShare = input.strategy === 'fewest_stops' ? 0.6 : input.strategy === 'cheapest' ? 0.5 : 0.4;
    const late = pool.filter((c) => c.alongKm - pos >= reach * minShare);
    if (late.length) pool = late;
    const furthest = Math.max(...pool.map((c) => c.alongKm));
    const span = Math.max(1, furthest - pos);
    const maxPower = Math.max(...pool.map(effPower));
    const prices = pool.map((c) => c.pricePerKwh);
    const [pLo, pHi] = [Math.min(...prices), Math.max(...prices)];

    const score = (c: RouteCandidate) => {
      const progress = (c.alongKm - pos) / span; // prefer going further
      const eff = Math.min(c.powerKw, c.currentType === 'DC' ? v.maxDcKw : v.maxAcKw) / (maxPower || 1);
      const price = pHi === pLo ? 1 : 1 - (c.pricePerKwh - pLo) / (pHi - pLo);
      const avail = c.availablePorts > 0 ? 1 : 0.3;
      const detour = Math.max(0, 1 - c.detourKm / 10);
      switch (input.strategy) {
        case 'fewest_stops':
          return progress * 0.6 + eff * 0.2 + avail * 0.1 + detour * 0.1;
        case 'cheapest':
          return price * 0.45 + progress * 0.3 + eff * 0.1 + avail * 0.05 + detour * 0.1;
        default:
          return eff * 0.45 + progress * 0.3 + avail * 0.15 + detour * 0.1;
      }
    };
    const chosen = pool.reduce((a, b) => (score(b) > score(a) ? b : a));
    visited.add(chosen.stationId);

    const legKm = chosen.alongKm - pos + pendingDetourKm + chosen.detourKm;
    const legMin = (chosen.alongKm - pos) / kmPerMin + (pendingDetourKm + chosen.detourKm) / detourSpeedKmPerMin;
    soc -= legKm * socPerKm;
    energyUsed += (legKm * whPerKm) / 1000;
    driveMin += legMin;
    clock += legMin * 60_000;
    const arrivalSoc = soc;

    // How much do we need from here?
    const kmAfter = input.distanceKm - chosen.alongKm + chosen.detourKm;
    const neededForDest = destSoc + kmAfter * socPerKm + 3; // +3 % buffer
    let target = Math.min(maxSoc, Math.ceil(neededForDest));
    if (neededForDest > maxSoc) {
      // We will need another stop anyway; with "fastest" stay in the fast part of the curve.
      target = maxSoc;
    }
    target = Math.max(target, Math.min(100, arrivalSoc + 5));
    if (neededForDest > maxSoc && maxSoc < 100 && !compatible.some((c) => c.alongKm > chosen.alongKm && !visited.has(c.stationId))) {
      // No more chargers ahead — charge as much as necessary (up to 100 %).
      target = Math.min(100, Math.ceil(neededForDest));
      if (neededForDest > 100) {
        feasible = false;
        warnings.push('The final leg is longer than a full battery allows with the configured reserve.');
      }
    }

    const wait = chosen.availablePorts > 0 ? 0 : chosen.estimatedWaitMinutes;
    const est = estimateCharging({
      vehicle: v,
      charger: { powerKw: chosen.powerKw, currentType: chosen.currentType },
      startSoc: arrivalSoc,
      targetSoc: target,
      ambientTempC: input.ambientTempC,
      startTime: new Date(clock + wait * 60_000),
      tariff: chosen.tariff ?? { currency: chosen.currency, baseRate: chosen.pricePerKwh },
      timeZone: chosen.timeZone,
      stepSoc: 1,
    });
    const arriveAt = new Date(clock).toISOString();
    clock += (wait + est.durationMinutes) * 60_000;
    waitMin += wait;
    chargeMin += est.durationMinutes;
    if (est.cost) costs[est.cost.currency] = round((costs[est.cost.currency] ?? 0) + est.cost.total, 2);

    stops.push({
      candidate: chosen,
      arrivalSoc: round(arrivalSoc, 1),
      departureSoc: target,
      chargeMinutes: Math.round(est.durationMinutes),
      waitMinutes: Math.round(wait),
      energyKwh: est.energyFromChargerKwh,
      cost: est.cost?.total ?? null,
      currency: est.cost?.currency ?? chosen.currency,
      arriveAt,
      departAt: new Date(clock).toISOString(),
      driveKmFromPrevious: round(legKm, 1),
    });
    soc = target;
    pos = chosen.alongKm;
    pendingDetourKm = chosen.detourKm;
  }

  // Final leg
  const finalKm = input.distanceKm - pos + pendingDetourKm;
  const finalMin = (input.distanceKm - pos) / kmPerMin + pendingDetourKm / detourSpeedKmPerMin;
  soc -= finalKm * socPerKm;
  energyUsed += (finalKm * whPerKm) / 1000;
  driveMin += finalMin;
  clock += finalMin * 60_000;
  if (soc < minArrival - 0.5 && feasible) {
    if (soc < 0) feasible = false;
    warnings.push(`Estimated arrival battery (${Math.max(0, Math.round(soc))} %) is below your ${minArrival} % reserve.`);
  }
  if (stops.length === 0 && feasible) notes.push('No charging stop needed for this trip.');
  if (stops.some((s) => s.waitMinutes > 0)) notes.push('Some stops currently have no free compatible port; waiting time is estimated.');

  return {
    strategy: input.strategy,
    feasible,
    stops,
    arrivalSoc: round(Math.max(0, soc), 1),
    consumptionWhPerKm: whPerKm,
    energyUsedKwh: round(energyUsed, 1),
    driveMinutes: Math.round(driveMin),
    chargeMinutes: Math.round(chargeMin),
    waitMinutes: Math.round(waitMin),
    totalMinutes: Math.round(driveMin + chargeMin + waitMin),
    totalChargingCost: costs,
    arriveAt: new Date(clock).toISOString(),
    warnings,
    notes,
  };
}
