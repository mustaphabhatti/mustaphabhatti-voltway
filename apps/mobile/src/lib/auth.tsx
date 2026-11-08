import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, loadToken, setToken } from './api';

export interface Me {
  user: { id: string; role: string; email: string | null; phone: string | null; fullName: string } | null;
  preferences?: any;
  defaultVehicle?: any;
}
interface Ctx {
  me: Me;
  ready: boolean;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (body: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>({ user: null });
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try { setMe(await api.get<Me>('/auth/me')); } catch { setMe({ user: null }); }
  }, []);
  useEffect(() => {
    (async () => {
      await loadToken();
      await refresh();
      setReady(true);
    })();
  }, [refresh]);
  const login = async (identifier: string, password: string) => {
    const r = await api.post<{ token: string }>('/auth/login', { identifier, password });
    await setToken(r.token);
    await refresh();
  };
  const register = async (body: Record<string, unknown>) => {
    const r = await api.post<{ token: string }>('/auth/register', body);
    await setToken(r.token);
    await refresh();
  };
  const logout = async () => {
    await setToken(null);
    setMe({ user: null });
  };
  return <AuthCtx.Provider value={{ me, ready, refresh, login, register, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
