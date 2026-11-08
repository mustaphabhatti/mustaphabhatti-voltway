import Link from 'next/link';
import { cn } from '@/lib/format';

/** Wattly brand mark. `product` names the sub-brand: Drive, Business, Network or Admin. */
export function Logo({ href = '/', className, product }: { href?: string; className?: string; product?: 'Drive' | 'Business' | 'Network' | 'Admin' }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)} aria-label={product ? `Wattly ${product}` : 'Wattly'}>
      <span className="size-8 rounded-[10px] bg-accent grid place-items-center shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4.5 text-white" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
      </span>
      <span className="text-[17px] whitespace-nowrap">Wattly{product && <span className="font-normal text-muted"> {product}</span>}</span>
    </Link>
  );
}
