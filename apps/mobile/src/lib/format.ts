export { formatDistance, formatDuration, formatMoney } from '@voltway/shared';

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString();
}
export const clock = (iso: string | Date) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const dateTime = (iso: string | Date) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
