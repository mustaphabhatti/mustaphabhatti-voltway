import type { Station } from './types';

export function stationTone(s: Pick<Station, 'status' | 'compatibleAvailable' | 'compatibleWorking' | 'openNow'>) {
  const op = s.status.operational;
  if (op === 'maintenance') return { hex: '#7c5cff', label: 'Maintenance' };
  if (op === 'no_power') return { hex: '#e08a00', label: 'No electricity' };
  if (op === 'offline') return { hex: '#e5484d', label: 'Offline' };
  if (op === 'unknown') return { hex: '#8a93a0', label: 'Unknown' };
  if (s.openNow.open === false) return { hex: '#6b7584', label: 'Closed' };
  if (s.compatibleAvailable > 0) return { hex: '#0fa968', label: 'Available' };
  if (s.compatibleWorking > 0) return { hex: '#2f6bff', label: 'Busy' };
  return { hex: '#e5484d', label: 'No compatible port working' };
}
