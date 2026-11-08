'use client';
import { useEffect, useRef, useState } from 'react';
import { Building2, Loader2, MapPin, Search, X, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/format';

export interface SearchResult { id: string; name: string; address: string; lat: number; lng: number; kind: 'place' | 'station' | 'address'; source: string; stationId?: string }

export function SearchBox({ onPick, near, placeholder = 'Search city, area, address or station', className, initial = '' }: { onPick: (r: SearchResult) => void; near?: { lat: number; lng: number } | null; placeholder?: string; className?: string; initial?: string }) {
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q, 250);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setQ(initial); }, [initial]);
  useEffect(() => {
    if (dq.trim().length < 2) return setResults([]);
    setLoading(true);
    api.get(`/search?q=${encodeURIComponent(dq)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ''}`).then((d) => { setResults(d.results); setActive(0); }).catch(() => setResults([])).finally(() => setLoading(false));
  }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const pick = (r: SearchResult) => { onPick(r); setQ(r.name); setOpen(false); };
  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="flex items-center gap-2 h-12 rounded-2xl bg-surface border border-border shadow-card px-3.5 focus-within:ring-4 focus-within:ring-[var(--ring)]">
        <Search className="size-[18px] text-subtle shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && results[active]) pick(results[active]);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open && results.length > 0}
          className="flex-1 bg-transparent outline-none text-[14.5px] placeholder:text-subtle min-w-0"
        />
        {loading ? <Loader2 className="size-4 animate-spin text-subtle" /> : q && <button aria-label="Clear search" onClick={() => { setQ(''); setResults([]); }} className="text-subtle hover:text-text"><X className="size-4" /></button>}
      </div>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-border bg-surface shadow-pop overflow-hidden z-[1200] animate-in" role="listbox">
          {!loading && results.length === 0 && <div className="px-4 py-3 text-sm text-muted">No matches. Try a city, area or station name.</div>}
          {results.map((r, i) => {
            const Icon = r.kind === 'station' ? Zap : r.kind === 'place' ? MapPin : Building2;
            return (
              <button key={r.id} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(r)}
                className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left', i === active && 'bg-surface-2')}>
                <span className={cn('size-8 rounded-lg grid place-items-center shrink-0', r.kind === 'station' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}><Icon className="size-4" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{r.name}</span>
                  <span className="block text-xs text-muted truncate">{r.address}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
