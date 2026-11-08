import { describe, expect, it } from 'vitest';
import { estimateCharging, cheapestStartWindow } from '../estimator';
import { rateAt, costForEnergyChunks, type Tariff } from '../pricing';
import { planRoute } from '../routePlanner';
import { scoreRecommendations } from '../recommend';
import { summarizePorts } from '../status';
import { haversineKm, decodePolyline, projectOntoLine } from '../geo';

const ioniq = { batteryKwh: 74, maxAcKw: 10.9, maxDcKw: 220, curveProfile: 'flat_800v' as const, efficiencyWhPerKm: 175 };
const tariff: Partial<Tariff> = {
  currency: 'PKR', baseRate: 80,
  periods: [
    { label: 'Peak', kind: 'peak', start: '17:00', end: '22:00', rate: 110 },
    { label: 'Off-peak night', kind: 'off_peak', start: '23:00', end: '06:00', rate: 55 },
  ],
  sessionFee: 50, serviceChargePercent: 5,
};

describe('estimator', () => {
  it('never exceeds the charger or vehicle limits', () => {
    const r = estimateCharging({ vehicle: ioniq, charger: { powerKw: 50, currentType: 'DC' }, startSoc: 10, targetSoc: 80 });
    expect(r.peakPowerKw).toBeLessThanOrEqual(50);
    expect(r.limitingFactor).toBe('charger');
    expect(r.energyToBatteryKwh).toBeCloseTo(74 * 0.7, 1);
    expect(r.energyFromChargerKwh).toBeGreaterThan(r.energyToBatteryKwh);
  });
  it('slows down above 80% on DC', () => {
    const a = estimateCharging({ vehicle: ioniq, charger: { powerKw: 350, currentType: 'DC' }, startSoc: 10, targetSoc: 80 });
    const b = estimateCharging({ vehicle: ioniq, charger: { powerKw: 350, currentType: 'DC' }, startSoc: 80, targetSoc: 100 });
    // 20 % above 80 takes much longer per percent than 70 % below it
    expect(b.durationMinutes / 20).toBeGreaterThan((a.durationMinutes / 70) * 3);
    expect(a.durationMinutes).toBeGreaterThan(14);
    expect(a.durationMinutes).toBeLessThan(30);
  });
  it('is limited by the on-board charger on AC', () => {
    const r = estimateCharging({ vehicle: ioniq, charger: { powerKw: 22, currentType: 'AC' }, startSoc: 20, targetSoc: 80 });
    expect(r.limitingFactor).toBe('vehicle');
    expect(r.peakPowerKw).toBeLessThanOrEqual(10.9);
    expect(r.durationMinutes / 60).toBeGreaterThan(3.9);
  });
  it('cold weather slows DC charging', () => {
    const warm = estimateCharging({ vehicle: ioniq, charger: { powerKw: 350, currentType: "DC" }, startSoc: 10, targetSoc: 80, ambientTempC: 25 });
    const cold = estimateCharging({ vehicle: ioniq, charger: { powerKw: 350, currentType: "DC" }, startSoc: 10, targetSoc: 80, ambientTempC: -5 });
    expect(cold.durationMinutes).toBeGreaterThan(warm.durationMinutes * 1.3);
  });
  it('prices across tariff windows and finds cheaper start times', () => {
    const start = new Date('2026-11-09T12:30:00Z'); // 17:30 in Karachi → peak
    const r = estimateCharging({ vehicle: ioniq, charger: { powerKw: 7.4, currentType: 'AC' }, startSoc: 20, targetSoc: 80, startTime: start, tariff, timeZone: 'Asia/Karachi' });
    expect(r.cost!.averageRate).toBeGreaterThan(80);
    const w = cheapestStartWindow({ vehicle: ioniq, charger: { powerKw: 7.4, currentType: 'AC' }, startSoc: 20, targetSoc: 80, startTime: start, tariff, timeZone: 'Asia/Karachi' });
    expect(w!.savings).toBeGreaterThan(0);
  });
});

describe('pricing', () => {
  it('applies peak, off-peak overnight, seasonal and discounts in local time', () => {
    expect(rateAt(tariff, new Date('2026-11-09T13:00:00Z'), 'Asia/Karachi').periodKind).toBe('peak'); // 18:00 PKT
    expect(rateAt(tariff, new Date('2026-11-09T20:00:00Z'), 'Asia/Karachi').rate).toBe(55); // 01:00 PKT
    expect(rateAt(tariff, new Date('2026-11-09T06:00:00Z'), 'Asia/Karachi').rate).toBe(80); // 11:00 PKT
    const t2 = { ...tariff, seasonal: [{ label: 'Summer', startMonth: 5, endMonth: 9, multiplier: 1.2 }], discounts: [{ label: 'Launch', percent: 10 }] };
    expect(rateAt(t2, new Date('2026-07-01T06:00:00Z'), 'Asia/Karachi').rate).toBeCloseTo(80 * 1.2 * 0.9, 2);
  });
  it('builds a cost breakdown', () => {
    const c = costForEnergyChunks(tariff, [{ kwh: 10, at: new Date('2026-11-09T06:00:00Z') }], 30, 'Asia/Karachi');
    expect(c.energyCost).toBe(800);
    expect(c.serviceCharge).toBe(40);
    expect(c.total).toBe(890);
  });
});

describe('route planner', () => {
  const cand = (id: string, along: number, power = 120, avail = 2) => ({
    stationId: id, name: id, lat: 0, lng: 0, alongKm: along, detourKm: 0.5, powerKw: power, currentType: 'DC' as const,
    pricePerKwh: 90, currency: 'PKR', availablePorts: avail, totalPorts: 2, estimatedWaitMinutes: 20, operational: true,
  });
  it('needs no stop when the battery suffices', () => {
    const r = planRoute({ distanceKm: 80, durationMinutes: 60, vehicle: ioniq, startSoc: 90, minArrivalSoc: 10, candidates: [cand('a', 40)], strategy: 'fastest' });
    expect(r.stops).toHaveLength(0);
    expect(r.feasible).toBe(true);
  });
  it('adds charging stops on a long trip and arrives above reserve', () => {
    const r = planRoute({
      distanceKm: 380, durationMinutes: 240, vehicle: ioniq, startSoc: 60, minArrivalSoc: 10,
      candidates: [cand('a', 90), cand('b', 160), cand('c', 230), cand('d', 300)], strategy: 'fastest',
    });
    expect(r.stops.length).toBeGreaterThan(0);
    expect(r.feasible).toBe(true);
    expect(r.arrivalSoc).toBeGreaterThanOrEqual(9.5);
    for (const s of r.stops) expect(s.arrivalSoc).toBeGreaterThanOrEqual(9.9);
  });
  it('reports infeasible routes', () => {
    const r = planRoute({ distanceKm: 600, durationMinutes: 400, vehicle: ioniq, startSoc: 30, minArrivalSoc: 10, candidates: [cand('far', 400)], strategy: 'fastest' });
    expect(r.feasible).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('recommendations & status', () => {
  it('ranks and badges candidates', () => {
    const base = { compatiblePorts: 2, availableCompatiblePorts: 1, currentType: 'DC' as const, currency: 'PKR', statusFresh: true };
    const r = scoreRecommendations([
      { ...base, stationId: 'near', name: 'near', distanceKm: 1, travelMinutes: 4, bestPowerKw: 30, pricePerKwh: 90, estimatedWaitMinutes: 0, chargeMinutes: 70, chargeCost: 4000 },
      { ...base, stationId: 'fast', name: 'fast', distanceKm: 6, travelMinutes: 15, bestPowerKw: 180, pricePerKwh: 100, estimatedWaitMinutes: 0, chargeMinutes: 20, chargeCost: 4400 },
    ], 'fastest');
    expect(r[0].stationId).toBe('fast');
    expect(r.find((x) => x.stationId === 'near')!.badges).toContain('Closest');
  });
  it('summarizes port statuses', () => {
    expect(summarizePorts([{ status: 'no_power' }, { status: 'no_power' }]).operationalStatus).toBe('no_power');
    expect(summarizePorts([{ status: 'available' }, { status: 'out_of_service' }]).operationalStatus).toBe('partial');
    expect(summarizePorts([{ status: 'available' }, { status: 'charging' }]).operationalStatus).toBe('operational');
  });
});

describe('geo', () => {
  it('computes distances and decodes polylines', () => {
    expect(haversineKm({ lat: 31.5204, lng: 74.3587 }, { lat: 33.6844, lng: 73.0479 })).toBeGreaterThan(260);
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toHaveLength(3);
    const p = projectOntoLine({ lat: 0.01, lng: 0.5 }, [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]);
    expect(p.offsetKm).toBeCloseTo(1.1, 1);
  });
});
