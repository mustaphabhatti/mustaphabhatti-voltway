'use client';
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/format';

// ── Button ───────────────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'electric';
type Size = 'sm' | 'md' | 'lg' | 'icon';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong shadow-sm dark:text-[#04140c]',
  electric: 'bg-electric text-white hover:opacity-90 shadow-sm',
  secondary: 'bg-surface-2 text-text hover:bg-surface-3',
  outline: 'border border-border bg-surface text-text hover:bg-surface-2',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'size-10 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }>(
  function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn('inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap', variants[variant], sizes[size], className)}
        {...rest}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="font-semibold text-[15px] tracking-tight">{title}</h3>
        {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
type Tone = 'neutral' | 'green' | 'blue' | 'red' | 'amber' | 'violet' | 'outline';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  green: 'bg-accent-soft text-accent-strong dark:text-accent',
  blue: 'bg-electric-soft text-electric',
  red: 'bg-danger-soft text-danger',
  amber: 'bg-warning-soft text-warning',
  violet: 'bg-violet-soft text-violet',
  outline: 'border border-border text-muted',
};
export function Badge({ tone = 'neutral', className, children, title }: { tone?: Tone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

// ── Form controls ───────────────────────────────────────────────────────────
const control = 'w-full rounded-xl border border-border bg-surface px-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-4 focus:ring-[var(--ring)] focus:border-accent transition disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'py-2 min-h-24', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-10 pr-8 appearance-none bg-[length:16px] bg-no-repeat bg-[right_10px_center]', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a93a0' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-[13px] font-medium mb-1.5">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger mt-1">{error}</span> : hint ? <span className="block text-xs text-muted mt-1">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex items-start gap-3 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium">{label}</span>}
          {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, className, accent = 'var(--accent)' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; accent?: string }) {
  const pctVal = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white', className)}
      style={{ background: `linear-gradient(to right, ${accent} ${pctVal}%, var(--surface-3) ${pctVal}%)` }}
    />
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('inline-flex rounded-xl bg-surface-2 p-1 gap-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-lg font-medium transition whitespace-nowrap', size === 'sm' ? 'px-2.5 h-7 text-xs' : 'px-3 h-8 text-[13px]', value === o.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] font-medium transition whitespace-nowrap',
        active ? 'border-accent bg-accent-soft text-accent-strong dark:text-accent' : 'border-border bg-surface text-muted hover:text-text hover:bg-surface-2', className)}
    >
      {children}
    </button>
  );
}

// ── Overlays ────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2500] flex items-end md:items-center justify-center p-0 md:p-6 fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn('relative w-full bg-surface border border-border shadow-pop rounded-t-2xl md:rounded-2xl max-h-[92vh] flex flex-col animate-in', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-base">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-subtle hover:text-text"><X className="size-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ── States ──────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} />;
}

export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center text-center py-12 px-6', className)}>
      <div className="size-12 rounded-2xl bg-surface-2 grid place-items-center text-subtle mb-3">{icon ?? <Inbox className="size-6" />}</div>
      <h3 className="font-semibold">{title}</h3>
      {body && <p className="text-sm text-muted mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: { message: string; status?: number } | null; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center text-center py-10 px-6', className)} role="alert">
      <div className="size-12 rounded-2xl bg-danger-soft grid place-items-center text-danger mb-3"><AlertTriangle className="size-6" /></div>
      <h3 className="font-semibold">{error?.status === 401 ? 'Sign in required' : error?.status === 403 ? 'Access denied' : error?.status === 404 ? 'Not found' : 'Something went wrong'}</h3>
      <p className="text-sm text-muted mt-1 max-w-sm">{error?.message ?? 'Unknown error'}</p>
      {onRetry && error?.status !== 403 && error?.status !== 404 && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}><RefreshCw className="size-3.5" /> Try again</Button>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone = 'neutral' }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'violet' }) {
  const toneBg: Record<string, string> = { neutral: 'bg-surface-2 text-muted', green: 'bg-accent-soft text-accent', blue: 'bg-electric-soft text-electric', amber: 'bg-warning-soft text-warning', red: 'bg-danger-soft text-danger', violet: 'bg-violet-soft text-violet' };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted font-medium">{label}</span>
        {icon && <span className={cn('size-8 rounded-lg grid place-items-center', toneBg[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6', className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full text-sm [&_th]:text-left [&_th]:font-medium [&_th]:text-muted [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:px-4 [&_th]:py-2.5 [&_th]:whitespace-nowrap [&_td]:px-4 [&_td]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_tbody_tr:hover]:bg-surface-2/50">
        {children}
      </table>
    </div>
  );
}
