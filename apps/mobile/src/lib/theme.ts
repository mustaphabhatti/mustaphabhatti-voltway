import { useColorScheme } from 'react-native';

const light = {
  bg: '#f6f7f9', surface: '#ffffff', surface2: '#f1f3f6', surface3: '#e7eaef', border: '#e3e6eb',
  text: '#0f1419', muted: '#5d6673', subtle: '#8a93a0',
  accent: '#0fa968', accentStrong: '#0b8f58', accentSoft: '#e3f7ee',
  electric: '#2f6bff', electricSoft: '#e7eeff', danger: '#e5484d', dangerSoft: '#fdeceb',
  warning: '#e08a00', warningSoft: '#fff4e0', violet: '#7c5cff', violetSoft: '#efebff',
  onAccent: '#ffffff',
};
const dark: typeof light = {
  bg: '#0b0e12', surface: '#12161c', surface2: '#181d24', surface3: '#222833', border: '#252b35',
  text: '#eef1f5', muted: '#9aa4b2', subtle: '#6b7584',
  accent: '#22c983', accentStrong: '#3ddc97', accentSoft: 'rgba(34,201,131,0.14)',
  electric: '#5b8cff', electricSoft: 'rgba(91,140,255,0.16)', danger: '#ff6b6f', dangerSoft: 'rgba(255,107,111,0.14)',
  warning: '#ffb224', warningSoft: 'rgba(255,178,36,0.14)', violet: '#9d87ff', violetSoft: 'rgba(157,135,255,0.16)',
  onAccent: '#04140c',
};
export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
export function useIsDark() {
  return useColorScheme() === 'dark';
}

export const STATUS_HEX: Record<string, string> = {
  available: '#0fa968', charging: '#2f6bff', occupied: '#2f6bff', reserved: '#7c5cff',
  out_of_service: '#e5484d', offline: '#e5484d', no_power: '#e08a00', unknown: '#8a93a0',
};

export function scoreHex(score: number | null) {
  if (score == null) return '#8a93a0';
  if (score >= 8.5) return '#0b8f58';
  if (score >= 7) return '#0fa968';
  if (score >= 5) return '#e08a00';
  return '#e5484d';
}

export function stationHex(s: { comingSoon?: boolean; status: { operational: string }; openNow: { open: boolean | null }; compatibleAvailable: number; compatibleWorking: number }) {
  if (s.comingSoon) return { hex: '#64748b', label: 'Coming soon' };
  const op = s.status.operational;
  if (op === 'maintenance') return { hex: '#7c5cff', label: 'Maintenance' };
  if (op === 'no_power') return { hex: '#e08a00', label: 'No electricity' };
  if (op === 'offline') return { hex: '#e5484d', label: 'Offline' };
  if (op === 'unknown') return { hex: '#8a93a0', label: 'Status unknown' };
  if (s.openNow.open === false) return { hex: '#6b7584', label: 'Closed' };
  if (s.compatibleAvailable > 0) return { hex: '#0fa968', label: 'Available' };
  if (s.compatibleWorking > 0) return { hex: '#2f6bff', label: 'Busy' };
  return { hex: '#e5484d', label: 'No working compatible port' };
}
