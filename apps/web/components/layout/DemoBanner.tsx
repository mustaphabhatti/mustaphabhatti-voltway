'use client';
import { useEffect, useState } from 'react';
import { FlaskConical, ServerCrash, X } from 'lucide-react';
import { usePlatform } from '@/lib/platform';

export function DemoBanner() {
  const { platform, apiDown } = usePlatform();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem('vw-demo-banner') === 'hidden');
    } catch {
      setHidden(false);
    }
  }, []);
  if (apiDown)
    return (
      <div className="bg-danger text-white text-[13px] px-4 py-2 flex items-center gap-2 justify-center">
        <ServerCrash className="size-4" /> Can&apos;t reach the Voltway API. Start it with <code className="font-mono bg-white/15 rounded px-1">npm run dev:api</code>.
      </div>
    );
  if (platform?.maintenanceBanner)
    return <div className="bg-warning text-black text-[13px] px-4 py-2 text-center">{platform.maintenanceBanner}</div>;
  if (!platform?.demo.showBanner || hidden) return null;
  return (
    <div className="bg-violet-soft text-violet text-[12.5px] px-4 py-1.5 flex items-center gap-2 justify-center relative">
      <FlaskConical className="size-3.5 shrink-0" />
      <span className="text-center">
        <b>Demo data.</b> Stations, operators and prices are fictional. Availability marked &ldquo;Demo feed&rdquo; is simulated, not live.
      </span>
      <button aria-label="Hide demo notice" className="absolute right-2 opacity-70 hover:opacity-100" onClick={() => { setHidden(true); try { sessionStorage.setItem('vw-demo-banner', 'hidden'); } catch { /* ignore */ } }}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}
