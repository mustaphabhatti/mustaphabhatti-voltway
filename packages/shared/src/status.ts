import type { PortStatus, StationOperationalStatus } from './types';

export interface PortLike {
  status: PortStatus;
}

export interface PortSummary {
  total: number;
  available: number;
  inUse: number; // charging + occupied
  reserved: number;
  outOfService: number;
  offline: number;
  noPower: number;
  unknown: number;
  operationalStatus: StationOperationalStatus;
}

export function summarizePorts(ports: PortLike[], maintenance = false): PortSummary {
  const s: PortSummary = {
    total: ports.length, available: 0, inUse: 0, reserved: 0, outOfService: 0, offline: 0, noPower: 0, unknown: 0,
    operationalStatus: 'unknown',
  };
  for (const p of ports) {
    switch (p.status) {
      case 'available': s.available++; break;
      case 'charging':
      case 'occupied': s.inUse++; break;
      case 'reserved': s.reserved++; break;
      case 'out_of_service': s.outOfService++; break;
      case 'offline': s.offline++; break;
      case 'no_power': s.noPower++; break;
      default: s.unknown++;
    }
  }
  const working = s.available + s.inUse + s.reserved;
  if (maintenance) s.operationalStatus = 'maintenance';
  else if (s.total === 0 || s.unknown === s.total) s.operationalStatus = 'unknown';
  else if (s.noPower === s.total) s.operationalStatus = 'no_power';
  else if (working === 0) s.operationalStatus = s.noPower > 0 ? 'no_power' : 'offline';
  else if (working < s.total - s.unknown) s.operationalStatus = 'partial';
  else s.operationalStatus = 'operational';
  return s;
}

/** Map an OCPP 1.6 ChargePointStatus to a Voltway port status. */
export function ocppStatusToPortStatus(status: string, errorCode?: string): PortStatus {
  switch (status) {
    case 'Available': return 'available';
    case 'Preparing':
    case 'Finishing':
    case 'SuspendedEV':
    case 'SuspendedEVSE': return 'occupied';
    case 'Charging': return 'charging';
    case 'Reserved': return 'reserved';
    case 'Unavailable': return 'out_of_service';
    case 'Faulted': return errorCode === 'PowerSwitchFailure' || errorCode === 'UnderVoltage' ? 'no_power' : 'out_of_service';
    default: return 'unknown';
  }
}

/** Map an OCPI 2.2.1 EVSE status to a Voltway port status. */
export function ocpiStatusToPortStatus(status: string): PortStatus {
  switch (status) {
    case 'AVAILABLE': return 'available';
    case 'CHARGING': return 'charging';
    case 'BLOCKED': return 'occupied';
    case 'RESERVED': return 'reserved';
    case 'INOPERATIVE':
    case 'OUTOFORDER': return 'out_of_service';
    case 'REMOVED':
    case 'PLANNED': return 'offline';
    default: return 'unknown';
  }
}

/** Minutes since a timestamp; Infinity if missing. */
export function ageMinutes(iso: string | Date | null | undefined, now = Date.now()) {
  if (!iso) return Infinity;
  return (now - new Date(iso).getTime()) / 60_000;
}

/** Status information older than this is shown as "last reported" rather than current. */
export const STALE_STATUS_MINUTES = { live: 15, simulated: 180, operator_reported: 24 * 60, user_reported: 180 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Community reliability score (0–10) from driver check-ins and ratings.
// Check-ins are weighted by recency (half-life ~3 months). A Bayesian prior keeps
// stations with few check-ins near the middle; fewer than 3 check-ins in a year
// returns null ("not enough data").
// ─────────────────────────────────────────────────────────────────────────────
export interface ReliabilityInput {
  weightedSuccess: number;
  weightedWaiting: number;
  weightedFailure: number;
  checkinCount: number;
  rating?: number | null;
}

export function reliabilityScore(i: ReliabilityInput): number | null {
  if (i.checkinCount < 3) return null;
  const priorSuccess = 1.5;
  const priorTotal = 2;
  const ok = i.weightedSuccess + 0.6 * i.weightedWaiting + priorSuccess;
  const total = i.weightedSuccess + i.weightedWaiting + i.weightedFailure + priorTotal;
  let score = (ok / total) * 10;
  if (i.rating != null) score = score * 0.85 + (i.rating / 5) * 10 * 0.15;
  return Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
}

export function reliabilityLabel(score: number | null) {
  if (score == null) return 'Not enough check-ins';
  if (score >= 8.5) return 'Very reliable';
  if (score >= 7) return 'Reliable';
  if (score >= 5) return 'Mixed reports';
  return 'Often has problems';
}

export const CHECKIN_OUTCOMES = {
  charged: 'Charged successfully',
  charging_now: 'Charging now',
  waiting: 'Waiting for a charger',
  could_not_charge: "Couldn't charge",
  comment: 'Left a comment',
} as const;
export type CheckinOutcome = keyof typeof CHECKIN_OUTCOMES;

export const CHECKIN_PROBLEMS = {
  broken: 'Charger broken / error',
  occupied: 'All chargers occupied',
  blocked_by_ice: 'Bay blocked by a non-EV',
  no_power: 'No electricity',
  payment_failed: 'Payment / app failed',
  slow: 'Very slow charging',
  access: "Couldn't access the site",
  other: 'Other problem',
} as const;
export type CheckinProblem = keyof typeof CHECKIN_PROBLEMS;

export const LOCATION_TYPES = {
  public: 'Public station',
  destination: 'Destination (mall, hotel, restaurant)',
  dealership: 'Car dealership',
  workplace: 'Workplace',
  residential: 'Home charger (shared by host)',
  highway: 'Highway / motorway',
} as const;
export type LocationType = keyof typeof LOCATION_TYPES;
