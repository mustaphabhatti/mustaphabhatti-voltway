'use client';
import { useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { Button } from '@/components/ui';

export function directionLinks(lat: number, lng: number, label?: string) {
  const q = encodeURIComponent(label ?? `${lat},${lng}`);
  return [
    { name: 'Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving` },
    { name: 'Apple Maps', href: `https://maps.apple.com/?daddr=${lat},${lng}&q=${q}` },
    { name: 'Waze', href: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` },
  ];
}

/** Turn-by-turn handoff to the driver's preferred navigation app. */
export function DirectionsButton({ lat, lng, label, size = 'md', className }: { lat: number; lng: number; label?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <Button variant="electric" size={size} className="w-full" onClick={() => setOpen((o) => !o)}><Navigation className="size-4" /> Directions</Button>
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-2 min-w-48 rounded-xl border border-border bg-surface shadow-pop p-1 z-50 animate-in">
          {directionLinks(lat, lng, label).map((l) => (
            <a key={l.name} href={l.href} target="_blank" rel="noreferrer" className="block px-3 py-2 rounded-lg text-sm hover:bg-surface-2" onClick={() => setOpen(false)}>Open in {l.name}</a>
          ))}
        </div>
      )}
    </div>
  );
}
