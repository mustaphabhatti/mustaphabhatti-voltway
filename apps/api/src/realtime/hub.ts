import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { signToken, verifyToken } from '../lib/auth';

/**
 * Minimal pub/sub hub over WebSockets.
 * Topics: "stations" (all status changes), "station:<id>", "user:<id>", "session:<id>".
 * For multi-instance deployments swap the in-memory fan-out for Redis / Postgres LISTEN/NOTIFY.
 */
interface Client {
  ws: WebSocket;
  userId: string | null;
  topics: Set<string>;
}

const clients = new Set<Client>();

export function publish(topic: string, event: string, data: unknown) {
  const msg = JSON.stringify({ topic, event, data, at: new Date().toISOString() });
  for (const c of clients) {
    if (c.topics.has(topic) && c.ws.readyState === 1) c.ws.send(msg);
  }
}

export function publishToUser(userId: string, event: string, data: unknown) {
  publish(`user:${userId}`, event, data);
}

export function connectedClients() {
  return clients.size;
}

export async function issueRealtimeToken(userId: string | null) {
  return signToken({ sub: userId ?? 'anon' }, '10m', 'realtime');
}

export async function registerRealtime(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as any)?.token as string | undefined;
    const payload = token ? await verifyToken<{ sub: string }>(token, 'realtime') : null;
    const userId = payload?.sub && payload.sub !== 'anon' ? payload.sub : null;
    const client: Client = { ws: socket, userId, topics: new Set(['stations']) };
    if (userId) client.topics.add(`user:${userId}`);
    clients.add(client);
    socket.send(JSON.stringify({ event: 'hello', data: { authenticated: !!userId } }));

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'subscribe' && Array.isArray(msg.topics)) {
          for (const t of msg.topics as string[]) {
            if (t.startsWith('user:') && t !== `user:${userId}`) continue;
            if (/^(stations|station:[\w-]+|session:[\w-]+|user:[\w-]+)$/.test(t)) client.topics.add(t);
          }
        } else if (msg.type === 'unsubscribe' && Array.isArray(msg.topics)) {
          for (const t of msg.topics) client.topics.delete(t);
        } else if (msg.type === 'ping') {
          socket.send(JSON.stringify({ event: 'pong' }));
        }
      } catch {
        /* ignore malformed */
      }
    });
    socket.on('close', () => clients.delete(client));
  });
}
