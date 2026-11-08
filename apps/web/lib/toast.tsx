'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; title: string; body?: string }
const Ctx = createContext<(kind: Kind, title: string, body?: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto z-[3000] flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto animate-in w-full md:w-96 rounded-xl border border-border bg-surface shadow-pop p-3 flex gap-3 items-start">
            {t.kind === 'success' ? <CheckCircle2 className="size-5 text-accent shrink-0" /> : t.kind === 'error' ? <AlertTriangle className="size-5 text-danger shrink-0" /> : <Info className="size-5 text-electric shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.body && <div className="text-sm text-muted mt-0.5">{t.body}</div>}
            </div>
            <button aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-subtle hover:text-text">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
