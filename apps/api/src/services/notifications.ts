import type { NotificationType } from '@wattly/shared';
import { q, one } from '../db';
import { publishToUser } from '../realtime/hub';

/**
 * Creates an in-app notification (respecting the user's preferences) and pushes it over WebSocket.
 * Delivery channels such as web push, email or SMS can be added here behind the same call.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  dedupeKey?: string,
) {
  if (type !== 'system') {
    const pref = await one<{ prefs: any }>('SELECT notification_prefs prefs FROM user_preferences WHERE user_id = $1', [userId]);
    if (pref?.prefs?.[type] === false) return null;
  }
  const row = await one<any>(
    `INSERT INTO notifications(user_id, type, title, body, data, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id, type, title, body, data, created_at, read_at`,
    [userId, type, title, body, data, dedupeKey ?? null],
  );
  if (row) publishToUser(userId, 'notification', row);
  return row;
}

/** Notify everyone who favorited (with notifications on) a station. */
export async function notifyFavorites(
  stationId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  dedupeKey?: string,
) {
  const users = await q<{ user_id: string }>('SELECT user_id FROM favorites WHERE station_id = $1 AND notify', [stationId]);
  for (const u of users) await notify(u.user_id, type, title, body, { stationId, ...data }, dedupeKey);
  return users.length;
}
