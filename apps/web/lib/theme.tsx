'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
const Ctx = createContext<{ theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void }>({ theme: 'system', resolved: 'light', setTheme: () => {} });

export const themeScript = `(function(){try{var t=localStorage.getItem('vw-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    try {
      setThemeState((localStorage.getItem('vw-theme') as Theme) || 'system');
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      setResolved(dark ? 'dark' : 'light');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem('vw-theme', t);
    } catch { /* ignore */ }
  };
  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
