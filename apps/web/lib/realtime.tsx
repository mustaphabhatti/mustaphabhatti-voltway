'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';

type Handler = (event: string, data: any, topic: string) => void;
interface RealtimeCtx {
  connected: boolean;
  subscribe: (topic: string, handler: Handler) => () => void;
}
const Ctx = createContext<RealtimeCtx>({ connected: false, subscribe: () => () => {} });

function wsUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const { protocol, hostname } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${hostname}:4000/ws`;
}

/** Single shared WebSocket with topic subscriptions and automatic reconnects. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [connected, setConnected] = useState(false);
  const handlers = useRef(new Map<string, Set<Handler>>());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    const connect = async () => {
      try {
        const { token } = await api.get<{ token: string }>('/realtime/token');
        if (stopped) return;
        const ws = new WebSocket(`${wsUrl()}?token=${encodeURIComponent(token)}`);
        wsRef.current = ws;
        ws.onopen = () => {
          retry = 0;
          setConnected(true);
          const topics = [...handlers.current.keys()];
          if (topics.length) ws.send(JSON.stringify({ type: 'subscribe', topics }));
        };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (!msg.topic) return;
            handlers.current.get(msg.topic)?.forEach((h) => h(msg.event, msg.data, msg.topic));
            if (msg.topic.startsWith('user:')) handlers.current.get('user')?.forEach((h) => h(msg.event, msg.data, msg.topic));
          } catch { /* ignore */ }
        };
        ws.onclose = () => {
          setConnected(false);
          if (!stopped) timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
        };
      } catch {
        if (!stopped) timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      }
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [me.user?.id]);

  const subscribe = (topic: string, handler: Handler) => {
    if (!handlers.current.has(topic)) {
      handlers.current.set(topic, new Set());
      if (topic !== 'user' && wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'subscribe', topics: [topic] }));
    }
    handlers.current.get(topic)!.add(handler);
    return () => {
      handlers.current.get(topic)?.delete(handler);
    };
  };

  return <Ctx.Provider value={{ connected, subscribe }}>{children}</Ctx.Provider>;
}

export function useRealtime(topic: string | null, handler: Handler) {
  const ctx = useContext(Ctx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!topic) return;
    return ctx.subscribe(topic, (e, d, t) => ref.current(e, d, t));
  }, [topic, ctx]);
  return ctx.connected;
}

export const useRealtimeStatus = () => useContext(Ctx).connected;
