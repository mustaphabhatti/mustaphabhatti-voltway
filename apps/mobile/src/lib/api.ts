import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const TOKEN_KEY = 'voltway.session';
let token: string | null = null;

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}
export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(isForm || method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
      },
      body: method === 'GET' ? undefined : isForm ? (body as FormData) : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(0, `Can't reach Voltway at ${API_URL}. Check your connection.`);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T = any>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  put: <T = any>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T = any>(p: string, b?: unknown) => request<T>('DELETE', p, b),
};

export function qs(params: Record<string, unknown>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue;
    parts.push(`${k}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export const absoluteUrl = (u: string) => (u.startsWith('http') ? u : `${API_URL}${u}`);
