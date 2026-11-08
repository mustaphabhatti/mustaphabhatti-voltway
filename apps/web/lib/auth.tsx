'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Me {
  user: { id: string; role: 'driver' | 'operator' | 'admin'; email: string | null; phone: string | null; fullName: string; companyIds: string[] } | null;
  preferences?: any;
  companies?: { id: string; name: string; slug: string; verification_status: string; member_role: string }[];
  defaultVehicle?: any;
}

interface AuthCtx {
  me: Me;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>({ user: null });
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/auth/me'));
    } catch {
      setMe({ user: null });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const login = async (identifier: string, password: string) => {
    await api.post('/auth/login', { identifier, password });
    await refresh();
  };
  const logout = async () => {
    await api.post('/auth/logout');
    setMe({ user: null });
  };
  return <Ctx.Provider value={{ me, loading, refresh, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
