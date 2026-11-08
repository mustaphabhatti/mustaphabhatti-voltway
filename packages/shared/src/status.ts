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
