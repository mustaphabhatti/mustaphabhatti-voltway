// ─────────────────────────────────────────────────────────────────────────────
// Tariff / time-of-use pricing engine.
// All time logic is evaluated in the station's local timezone.
// ─────────────────────────────────────────────────────────────────────────────

export type PeriodKind = 'peak' | 'off_peak' | 'shoulder' | 'super_off_peak';

export interface TouPeriod {
  label: string;
  kind: PeriodKind;
  /** 0 = Sunday … 6 = Saturday. Empty / omitted = every day. */
  days?: number[];
  /** "HH:MM" local time. A period may cross midnight (start > end). */
  start: string;
  end: string;
  /** Price per kWh during this period. */
  rate: number;
}

export interface SeasonalRule {
  label: string;
  /** 1–12 inclusive; may wrap the year end (e.g. 11 → 2). */
  startMonth: number;
  endMonth: number;
  /** Multiplier applied to the energy rate, e.g. 1.1 = +10 %. */
  multiplier: number;
}

export interface DiscountRule {
  label: string;
  percent: number;
  days?: number[];
  start?: string;
  end?: string;
  /** ISO dates (inclusive) */
  validFrom?: string;
  validTo?: string;
}

export interface DynamicPricing {
  enabled: boolean;
  /** Multiplier when the site is empty (utilization 0). */
  minMultiplier: number;
  /** Multiplier when the site is full (utilization 1). */
  maxMultiplier: number;
}

export interface Tariff {
  currency: string;
  /** Default energy price per kWh. */
  baseRate: number;
  /** Optional flat weekend rate replacing `baseRate` on weekend days (TOU periods still win). */
  weekendRate?: number | null;
  weekendDays?: number[];
  periods: TouPeriod[];
  seasonal: SeasonalRule[];
  discounts: DiscountRule[];
  dynamic: DynamicPricing;
  /** One-off fee per session. */
  sessionFee: number;
  /** Optional per-minute time fee while plugged in. */
  timeFeePerMinute: number;
  /** Parking fee per hour while at the station (0 = free). */
  parkingFeePerHour: number;
  /** Idle fee per minute after charging completes and the grace period passes. */
  idleFeePerMinute: number;
  idleGraceMinutes: number;
  /** Service charge as a percentage of the energy cost. */
  serviceChargePercent: number;
  /** Tax percent applied to the final total (0 = included / not applicable). */
  taxPercent: number;
}

export const DEFAULT_TARIFF: Tariff = {
  currency: 'PKR',
  baseRate: 75,
  weekendRate: null,
  weekendDays: [0, 6],
  periods: [],
  seasonal: [],
  discounts: [],
  dynamic: { enabled: false, minMultiplier: 0.9, maxMultiplier: 1.2 },
  sessionFee: 0,
  timeFeePerMinute: 0,
  parkingFeePerHour: 0,
  idleFeePerMinute: 0,
  idleGraceMinutes: 10,
  serviceChargePercent: 0,
  taxPercent: 0,
};

export function normalizeTariff(t: Partial<Tariff> | null | undefined): Tariff {
  return {
    ...DEFAULT_TARIFF,
    ...(t ?? {}),
    periods: t?.periods ?? [],
    seasonal: t?.seasonal ?? [],
    discounts: t?.discounts ?? [],
    dynamic: { ...DEFAULT_TARIFF.dynamic, ...(t?.dynamic ?? {}) },
  };
}

export interface LocalTime {
  /** 0 = Sunday */
  dow: number;
  /** minutes after local midnight */
  minutes: number;
  month: number;
  /** YYYY-MM-DD */
  date: string;
  hour: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

export function localTime(at: Date, timeZone = 'UTC'): LocalTime {
  let fmt = dtfCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    dtfCache.set(timeZone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const dows: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(parts.hour) % 24;
  return {
    dow: dows[parts.weekday as string] ?? 0,
    minutes: hour * 60 + Number(parts.minute),
    month: Number(parts.month),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
  };
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function inTimeWindow(minutes: number, start: string, end: string): boolean {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === e) return true; // full day
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

function inMonths(month: number, start: number, end: number) {
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

export interface RateQuote {
  /** Final price per kWh after all rules. */
  rate: number;
  baseRate: number;
  periodLabel: string;
  periodKind: PeriodKind | 'standard' | 'weekend';
  multipliers: { label: string; value: number }[];
  discounts: { label: string; percent: number }[];
  currency: string;
}

export function rateAt(tariffIn: Partial<Tariff>, at: Date, timeZone = 'UTC', utilization?: number): RateQuote {
  const t = normalizeTariff(tariffIn);
  const lt = localTime(at, timeZone);
  let base = t.baseRate;
  let periodLabel = 'Standard rate';
  let periodKind: RateQuote['periodKind'] = 'standard';

  const weekendDays = t.weekendDays ?? [0, 6];
  if (t.weekendRate != null && weekendDays.includes(lt.dow)) {
    base = t.weekendRate;
    periodLabel = 'Weekend rate';
    periodKind = 'weekend';
  }
  const period = t.periods.find(
    (p) => (!p.days || p.days.length === 0 || p.days.includes(lt.dow)) && inTimeWindow(lt.minutes, p.start, p.end),
  );
  if (period) {
    base = period.rate;
    periodLabel = period.label;
    periodKind = period.kind;
  }

  const multipliers: RateQuote['multipliers'] = [];
  for (const s of t.seasonal) {
    if (inMonths(lt.month, s.startMonth, s.endMonth)) multipliers.push({ label: s.label, value: s.multiplier });
  }
  if (t.dynamic.enabled && utilization != null && Number.isFinite(utilization)) {
    const u = Math.max(0, Math.min(1, utilization));
    const m = t.dynamic.minMultiplier + (t.dynamic.maxMultiplier - t.dynamic.minMultiplier) * u;
    multipliers.push({ label: `Dynamic (${Math.round(u * 100)}% busy)`, value: round(m, 3) });
  }
  const discounts: RateQuote['discounts'] = [];
  for (const d of t.discounts) {
    if (d.validFrom && lt.date < d.validFrom) continue;
    if (d.validTo && lt.date > d.validTo) continue;
    if (d.days && d.days.length && !d.days.includes(lt.dow)) continue;
    if (d.start && d.end && !inTimeWindow(lt.minutes, d.start, d.end)) continue;
    discounts.push({ label: d.label, percent: d.percent });
  }

  let rate = base;
  for (const m of multipliers) rate *= m.value;
  // Discounts are not stacked additively beyond 90 % to avoid nonsense configurations.
  const totalDiscount = Math.min(90, discounts.reduce((s, d) => s + d.percent, 0));
  rate *= 1 - totalDiscount / 100;

  return { rate: round(rate, 2), baseRate: base, periodLabel, periodKind, multipliers, discounts, currency: t.currency };
}

/** Price per kWh for every 30-minute slot of a local day starting at `from`. */
export function dailySchedule(tariff: Partial<Tariff>, from: Date, timeZone = 'UTC', slots = 48, slotMinutes = 30) {
  const out: { at: string; localLabel: string; rate: number; periodLabel: string; periodKind: RateQuote['periodKind'] }[] = [];
  for (let i = 0; i < slots; i++) {
    const at = new Date(from.getTime() + i * slotMinutes * 60_000);
    const q = rateAt(tariff, at, timeZone);
    const lt = localTime(at, timeZone);
    out.push({
      at: at.toISOString(),
      localLabel: `${String(lt.hour).padStart(2, '0')}:${String(lt.minutes % 60).padStart(2, '0')}`,
      rate: q.rate,
      periodLabel: q.periodLabel,
      periodKind: q.periodKind,
    });
  }
  return out;
}

export interface CostBreakdown {
  currency: string;
  energyKwh: number;
  energyCost: number;
  averageRate: number;
  serviceCharge: number;
  sessionFee: number;
  timeFee: number;
  parkingFee: number;
  tax: number;
  total: number;
  /** Fees that may apply but are not included (e.g. idle fee). */
  notes: string[];
}

/**
 * Turn a list of (kWh, timestamp) energy chunks into a cost breakdown.
 * Each chunk is priced at the rate in force at its timestamp.
 */
export function costForEnergyChunks(
  tariffIn: Partial<Tariff>,
  chunks: { kwh: number; at: Date }[],
  durationMinutes: number,
  timeZone = 'UTC',
  utilization?: number,
): CostBreakdown {
  const t = normalizeTariff(tariffIn);
  let energyCost = 0;
  let energy = 0;
  for (const c of chunks) {
    energyCost += c.kwh * rateAt(t, c.at, timeZone, utilization).rate;
    energy += c.kwh;
  }
  const serviceCharge = (energyCost * t.serviceChargePercent) / 100;
  const timeFee = t.timeFeePerMinute * durationMinutes;
  const parkingFee = (t.parkingFeePerHour * durationMinutes) / 60;
  const subtotal = energyCost + serviceCharge + t.sessionFee + timeFee + parkingFee;
  const tax = (subtotal * t.taxPercent) / 100;
  const notes: string[] = [];
  if (t.idleFeePerMinute > 0)
    notes.push(`Idle fee of ${t.currency} ${t.idleFeePerMinute}/min applies ${t.idleGraceMinutes} min after charging completes.`);
  return {
    currency: t.currency,
    energyKwh: round(energy, 2),
    energyCost: round(energyCost, 2),
    averageRate: energy > 0 ? round(energyCost / energy, 2) : t.baseRate,
    serviceCharge: round(serviceCharge, 2),
    sessionFee: round(t.sessionFee, 2),
    timeFee: round(timeFee, 2),
    parkingFee: round(parkingFee, 2),
    tax: round(tax, 2),
    total: round(subtotal + tax, 2),
    notes,
  };
}

export function round(n: number, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function formatMoney(amount: number | null | undefined, currency = 'PKR') {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount >= 1000 ? 0 : amount < 10 ? 2 : 0,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
