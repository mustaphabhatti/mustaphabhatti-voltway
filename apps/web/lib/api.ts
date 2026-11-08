export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Json = object | null;

async function request<T>(method: string, url: string, body?: Json | FormData): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url.startsWith('/api') ? url : `/api${url}`, {
      method,
      credentials: 'include',
      headers: isForm ? undefined : body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
      body: isForm ? (body as FormData) : method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach Wattly right now. Check your connection and try again.');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const msg = data?.error ?? (res.status === 502 || res.status === 504 ? 'The Wattly API is not responding. Is it running?' : `Request failed (${res.status})`);
    throw new ApiError(res.status, msg, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: Json | FormData) => request<T>('POST', url, body),
  put: <T = any>(url: string, body?: Json) => request<T>('PUT', url, body),
  patch: <T = any>(url: string, body?: Json) => request<T>('PATCH', url, body),
  del: <T = any>(url: string, body?: Json) => request<T>('DELETE', url, body),
};

export function qs(params: Record<string, unknown>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
