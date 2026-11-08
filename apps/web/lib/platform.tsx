'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Platform {
  name: string;
  supportEmail: string;
  defaultCity: string;
  maintenanceBanner: string;
  demo: { showBanner: boolean; demoStations: number; simulator: boolean; sessionSpeed: number };
  maps: { liveTraffic: boolean; routing: string[] };
  payments: { provider: string; demo: boolean };
}
const Ctx = createContext<{ platform: Platform | null; apiDown: boolean }>({ platform: null, apiDown: false });

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [apiDown, setApiDown] = useState(false);
  useEffect(() => {
    api.get<Platform>('/platform').then(setPlatform).catch(() => setApiDown(true));
  }, []);
  return <Ctx.Provider value={{ platform, apiDown }}>{children}</Ctx.Provider>;
}
export const usePlatform = () => useContext(Ctx);
