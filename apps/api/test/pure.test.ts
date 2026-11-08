import { describe, expect, it } from 'vitest';
import { mapOcpiConnector } from '../src/integrations/ocpi/client';
import { typicalTrafficFactor, levelFromDelay } from '../src/integrations/maps/traffic';
import { reliabilityScore, ocppStatusToPortStatus } from '@voltway/shared';

describe('OCPI mapping', () => {
  it('maps CCS2 DC connectors with power from max_electric_power', () => {
    expect(mapOcpiConnector({ standard: 'IEC_62196_T2_COMBO', power_type: 'DC', max_electric_power: 150000 })).toMatchObject({ connectorType: 'CCS2', currentType: 'DC', maxPowerKw: 150 });
  });
  it('derives 3-phase AC power from voltage × amperage', () => {
    expect(mapOcpiConnector({ standard: 'IEC_62196_T2', power_type: 'AC_3_PHASE', max_voltage: 230, max_amperage: 32 }).maxPowerKw).toBeCloseTo(22.1, 1);
  });
});

describe('traffic model', () => {
  it('is heavier at weekday evening rush hour (Karachi time)', () => {
    const rush = typicalTrafficFactor(new Date('2026-11-09T13:30:00Z'), 'Asia/Karachi', true); // 18:30 PKT Monday
    const night = typicalTrafficFactor(new Date('2026-11-09T20:00:00Z'), 'Asia/Karachi', true); // 01:00 PKT
    expect(rush.factor).toBeGreaterThan(night.factor);
    expect(rush.level).toBe('heavy');
  });
  it('classifies delay ratios', () => {
    expect(levelFromDelay(60, 90)).toBe('heavy');
    expect(levelFromDelay(60, 62)).toBe('light');
  });
});

describe('community & OCPP helpers', () => {
  it('needs at least 3 check-ins for a reliability score and rewards success', () => {
    expect(reliabilityScore({ weightedSuccess: 2, weightedWaiting: 0, weightedFailure: 0, checkinCount: 2 })).toBeNull();
    const good = reliabilityScore({ weightedSuccess: 10, weightedWaiting: 1, weightedFailure: 0, checkinCount: 11 })!;
    const bad = reliabilityScore({ weightedSuccess: 3, weightedWaiting: 1, weightedFailure: 6, checkinCount: 10 })!;
    expect(good).toBeGreaterThan(8);
    expect(bad).toBeLessThan(5);
  });
  it('maps OCPP statuses', () => {
    expect(ocppStatusToPortStatus('Charging')).toBe('charging');
    expect(ocppStatusToPortStatus('Faulted', 'UnderVoltage')).toBe('no_power');
    expect(ocppStatusToPortStatus('SuspendedEV')).toBe('occupied');
  });
});
