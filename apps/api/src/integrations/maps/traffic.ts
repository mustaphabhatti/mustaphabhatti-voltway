import { localTime } from '@wattly/shared';
import type { TrafficLevel } from './types';

/**
 * Typical-traffic model used when no live traffic provider is configured.
 * Output is always labelled "estimated" — it is a time-of-day pattern, not live data.
 */
export function typicalTrafficFactor(at: Date, timeZone: string, urban: boolean): { factor: number; level: TrafficLevel } {
  if (!urban) return { factor: 1.03, level: 'light' };
  const lt = localTime(at, timeZone);
  const weekend = lt.dow === 0 || (timeZone.startsWith('Asia/Dubai') ? lt.dow === 6 : false);
  const h = lt.hour + (lt.minutes % 60) / 60;
  let f = 1.08;
  if (!weekend) {
    if (h >= 8 && h < 10) f = 1.45;
    else if (h >= 13 && h < 14.5) f = 1.2;
    else if (h >= 17 && h < 20) f = 1.55;
    else if (h >= 22 || h < 6) f = 1.0;
  } else if (h >= 18 && h < 22) f = 1.3;
  return { factor: f, level: f >= 1.4 ? 'heavy' : f >= 1.18 ? 'moderate' : 'light' };
}

export function levelFromDelay(baseMin: number, trafficMin: number): TrafficLevel {
  if (!baseMin) return 'unknown';
  const r = trafficMin / baseMin;
  return r >= 1.35 ? 'heavy' : r >= 1.12 ? 'moderate' : 'light';
}
