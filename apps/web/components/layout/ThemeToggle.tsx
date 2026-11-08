'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/format';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const opts = [
    { v: 'light' as const, icon: Sun, label: 'Light' },
    { v: 'dark' as const, icon: Moon, label: 'Dark' },
    { v: 'system' as const, icon: Monitor, label: 'System' },
  ];
  return (
    <div className={cn('inline-flex rounded-xl bg-surface-2 p-1', className)} role="radiogroup" aria-label="Theme">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={theme === o.v} title={o.label} onClick={() => setTheme(o.v)}
          className={cn('size-7 grid place-items-center rounded-lg transition', theme === o.v ? 'bg-surface text-text shadow-sm' : 'text-subtle hover:text-text')}>
          <o.icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
