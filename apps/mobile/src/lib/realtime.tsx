import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { WS_URL } from './config';
import { useAuth } from './auth';

type Handler = (event: string, data: any) => void;
const Ctx = createContext<{ connected: boolean; subscribe: (topic: string, h: Handler) => () => void }>({ connected: false, subscribe: () => () => {} });

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** One WebSocket per app: station status, session progress and in-app notifications. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [connected, setConnected] = useState(false);
  const handlers = useRef(new Map<string, Set<Handler>>());
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (me.user) Notifications.requestPermissionsAsync().catch(() => {});
  }, [me.user?.id]);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    const connect = async () => {
      try {
        const { token } = await api.get<{ token: string }>('/realtime/token');
        if (stopped) return;
        const sock = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
        ws.current = sock;
        sock.onopen = () => {
          retry = 0;
          setConnected(true);
          const topics = [...handlers.current.keys()].filter((t) => t !== 'user');
          if (topics.length) sock.send(JSON.stringify({ type: 'subscribe', topics }));
        };
        sock.onmessage = (e) => {
          try {
            const msg = JSON.parse(String(e.data));
            if (!msg.topic) return;
            handlers.current.get(msg.topic)?.forEach((h) => h(msg.event, msg.data));
            if (msg.topic.startsWith('user:')) {
              handlers.current.get('user')?.forEach((h) => h(msg.event, msg.data));
              if (msg.event === 'notification')
                Notifications.scheduleNotificationAsync({ content: { title: msg.data.title, body: msg.data.body, data: msg.data.data ?? {} }, trigger: null }).catch(() => {});
            }
          } catch { /* ignore */ }
        };
        sock.onclose = () => {
          setConnected(false);
          if (!stopped) timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
        };
      } catch {
        if (!stopped) timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      }
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); ws.current?.close(); };
  }, [me.user?.id]);

  const subscribe = (topic: string, h: Handler) => {
    if (!handlers.current.has(topic)) {
      handlers.current.set(topic, new Set());
      if (topic !== 'user' && ws.current?.readyState === 1) ws.current.send(JSON.stringify({ type: 'subscribe', topics: [topic] }));
    }
    handlers.current.get(topic)!.add(h);
    return () => { handlers.current.get(topic)?.delete(h); };
  };
  return <Ctx.Provider value={{ connected, subscribe }}>{children}</Ctx.Provider>;
}

export function useRealtime(topic: string | null, handler: Handler) {
  const ctx = useContext(Ctx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!topic) return;
    return ctx.subscribe(topic, (e, d) => ref.current(e, d));
  }, [topic, ctx]);
  return ctx.connected;
}
