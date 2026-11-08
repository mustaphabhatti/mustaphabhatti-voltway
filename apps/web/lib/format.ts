export { formatMoney, formatDistance, formatDuration } from '@voltway/shared';

export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 45) return 'just now';
  if (s < 90) return '1 min ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso: string | Date, timeZone?: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone });
}

export function dateTime(iso: string | Date, timeZone?: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

export function shortDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function kw(n: number) {
  return `${n % 1 === 0 ? n : n.toFixed(1)} kW`;
}

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function pct(n: number, d = 0) {
  return `${(n * 100).toFixed(d)}%`;
}
