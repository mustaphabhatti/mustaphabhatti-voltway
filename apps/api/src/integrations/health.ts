/** Tracks the health of external integrations for the admin "Integrations" page. */
export interface IntegrationHealth {
  name: string;
  ok: boolean | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}
const state = new Map<string, IntegrationHealth>();

export function reportOk(name: string) {
  const s = state.get(name) ?? { name, ok: null, lastSuccessAt: null, lastErrorAt: null, lastError: null };
  state.set(name, { ...s, ok: true, lastSuccessAt: new Date().toISOString() });
}
export function reportError(name: string, err: unknown) {
  const s = state.get(name) ?? { name, ok: null, lastSuccessAt: null, lastErrorAt: null, lastError: null };
  state.set(name, { ...s, ok: false, lastErrorAt: new Date().toISOString(), lastError: err instanceof Error ? err.message : String(err) });
}
export function allHealth() {
  return [...state.values()];
}

export async function fetchJson<T = any>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 6000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': 'Wattly/0.1 (EV charging platform)', ...(init.headers ?? {}) } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
