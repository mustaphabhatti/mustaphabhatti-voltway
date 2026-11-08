import Link from 'next/link';
import { cn } from '@/lib/format';

export function Logo({ href = '/', className, suffix }: { href?: string; className?: string; suffix?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="size-8 rounded-[10px] bg-accent grid place-items-center shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4.5 text-white" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
      </span>
      <span className="text-[17px]">Voltway</span>
      {suffix && <span className="text-[11px] font-medium uppercase tracking-wider text-muted bg-surface-2 rounded-md px-1.5 py-0.5">{suffix}</span>}
    </Link>
  );
}
