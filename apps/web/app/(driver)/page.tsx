'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { List, LocateFixed, Map as MapIcon, MapPin, MapPinPlus, Wifi, WifiOff } from 'lucide-react';
import { Map } from '@/components/map';
import { StationCard } from '@/components/station/StationCard';
import { StationPanel } from '@/components/station/StationPanel';
import { SearchBox } from '@/components/station/SearchBox';
import { DEFAULT_FILTERS, FilterPanel, QuickFilters, activeFilterCount, type FilterState } from '@/components/station/Filters';
import { Button, EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGeolocation, DEFAULT_CENTER } from '@/lib/geo';
import { useDebounced, useMediaQuery } from '@/lib/hooks';
import { useLiveStations } from '@/lib/useLiveStations';
import { stationTone } from '@/lib/stationColor';
import { cn } from '@/lib/format';
import type { Station } from '@/lib/types';

export default function ExplorePage() {
  const { me } = useAuth();
  const geo = useGeolocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [selected, setSelected] = useState<Station | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const centeredOnUser = useRef(false);
  const origin = geo.position && !geo.isFallback ? geo.position : null;
  const dBbox = useDebounced(bbox, 250);

  useEffect(() => {
    if (origin && !centeredOnUser.current) {
      centeredOnUser.current = true;
      setFlyTo({ ...origin, zoom: 13, key: Date.now() });
    }
  }, [origin]);

  const load = useCallback(async () => {
    if (!dBbox) return;
    setLoading(true);
    try {
      const d = await api.get(`/stations${qs({
        bbox: dBbox.map((n) => n.toFixed(4)).join(','), lat: origin?.lat, lng: origin?.lng, connectors: filters.connectors, currentTypes: filters.currentTypes,
        minPowerKw: filters.minPowerKw || null, maxPrice: filters.maxPrice, available: filters.available, openNow: filters.openNow, is247: filters.is247,
        amenities: filters.amenities, networks: filters.networks, minScore: filters.minScore || null, comingSoon: filters.comingSoon, locationTypes: filters.locationTypes, sort: origin ? filters.sort : filters.sort === 'distance' ? null : filters.sort, limit: 300,
      })}`);
      setStations(d.stations);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [dBbox, filters, origin?.lat, origin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  const connected = useLiveStations(setStations);
  // Keep the open panel in sync with live updates.
  useEffect(() => {
    if (selected) {
      const fresh = stations.find((s) => s.id === selected.id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [stations]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { available: 0, busy: 0, down: 0 };
    for (const s of stations) {
      const t = stationTone(s).label;
      if (t === 'Available') c.available++;
      else if (t === 'Busy') c.busy++;
      else c.down++;
    }
    return c;
  }, [stations]);

  const select = (s: Station) => {
    setSelected(s);
    setFlyTo({ lat: s.lat, lng: s.lng, key: Date.now() });
    if (!isDesktop) setView('map');
  };

  const listPanel = (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{loading && !stations.length ? 'Loading stations…' : `${stations.length} station${stations.length === 1 ? '' : 's'} in view`}</div>
          <div className="text-xs text-muted flex gap-2 mt-0.5">
            <span className="text-accent">{counts.available} available</span><span className="text-electric">{counts.busy} busy</span><span>{counts.down} unavailable</span>
          </div>
        </div>
        <span className={cn('inline-flex items-center gap-1 text-[11px]', connected ? 'text-accent' : 'text-subtle')} title={connected ? 'Receiving status updates' : 'Reconnecting to updates…'}>
          {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}{connected ? 'Updating' : 'Offline'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4 space-y-2.5">
        {error ? <ErrorState error={error} onRetry={load} /> : loading && !stations.length ? <SkeletonList rows={5} /> : stations.length === 0 ? (
          <EmptyState icon={<MapPin className="size-6" />} title="No stations here" body={activeFilterCount(filters) ? 'Try removing some filters or zooming out.' : 'Zoom out or search another area.'}
            action={activeFilterCount(filters) ? <Button variant="outline" size="sm" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>Clear filters</Button> : undefined} />
        ) : stations.map((s) => <StationCard key={s.id} s={s} selected={selected?.id === s.id} onClick={() => select(s)} />)}
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 flex">
      {/* Desktop side panel */}
      <aside className="hidden lg:flex w-[400px] shrink-0 flex-col border-r border-border bg-bg z-[500]">
        <div className="p-4 pb-2 space-y-3 border-b border-border bg-surface">
          <SearchBox near={origin} onPick={(r) => { if (r.stationId) setFlyTo({ lat: r.lat, lng: r.lng, zoom: 15, key: Date.now() }); else setFlyTo({ lat: r.lat, lng: r.lng, zoom: r.kind === 'place' && !r.address.includes(',') ? 12 : 14, key: Date.now() }); }} />
          <QuickFilters f={filters} set={setFilters} onOpen={() => setFiltersOpen(true)} vehicleConnectors={me.defaultVehicle?.connectors} />
        </div>
        <div className="flex-1 min-h-0">{selected ? <StationPanel station={selected} origin={origin} onClose={() => setSelected(null)} /> : listPanel}</div>
      </aside>

      <div className="relative flex-1 min-w-0">
        <Map
          center={DEFAULT_CENTER}
          zoom={12}
          stations={stations}
          selectedId={selected?.id}
          onSelect={select}
          user={origin}
          onMove={(b) => setBbox(b)}
          flyTo={flyTo}
        />

        {/* Mobile search & chips */}
        <div className="lg:hidden absolute top-3 left-3 right-3 z-[600] space-y-2">
          <SearchBox near={origin} onPick={(r) => setFlyTo({ lat: r.lat, lng: r.lng, zoom: 14, key: Date.now() })} />
          <QuickFilters f={filters} set={setFilters} onOpen={() => setFiltersOpen(true)} vehicleConnectors={me.defaultVehicle?.connectors} />
        </div>

        {/* Location permission prompt */}
        {(geo.status === 'prompt' || geo.status === 'denied' || geo.status === 'unavailable') && !origin && (
          <div className="absolute z-[600] left-3 right-3 lg:left-4 lg:right-auto top-[132px] lg:top-4 lg:max-w-sm rounded-2xl border border-border bg-surface shadow-pop p-3 flex items-center gap-3 animate-in">
            <div className="size-9 rounded-xl bg-electric-soft text-electric grid place-items-center shrink-0"><LocateFixed className="size-4" /></div>
            <div className="text-[13px] flex-1">
              <div className="font-medium">{geo.status === 'denied' ? 'Location access is blocked' : 'Find chargers near you'}</div>
              <div className="text-muted">{geo.status === 'denied' ? 'Allow location in your browser settings. Showing Lahore (demo region).' : 'Share your location to see distances and drive times.'}</div>
            </div>
            {geo.status !== 'denied' && <Button size="sm" variant="electric" onClick={geo.request}>Allow</Button>}
          </div>
        )}

        {/* Map controls */}
        <div className="absolute z-[600] right-3 bottom-24 lg:bottom-6 flex flex-col gap-2">
          <Link href="/add-station" title="Add a missing station"><Button variant="outline" size="icon" aria-label="Add a station" className="shadow-card"><MapPinPlus className="size-[18px]" /></Button></Link>
          <Button variant="outline" size="icon" aria-label="Center on my location" className="shadow-card" onClick={() => { if (origin) setFlyTo({ ...origin, zoom: 14, key: Date.now() }); else geo.request(); }}>
            <LocateFixed className={cn('size-[18px]', origin && 'text-electric')} />
          </Button>
        </div>
        <div className="absolute z-[600] left-3 bottom-24 lg:bottom-6 hidden md:flex items-center gap-3 rounded-xl bg-surface/95 border border-border shadow-card px-3 py-2 text-[11.5px] text-muted">
          {[['#0fa968', 'Available'], ['#2f6bff', 'Busy'], ['#e5484d', 'Offline'], ['#e08a00', 'No power'], ['#8a93a0', 'Unknown']].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c }} />{l}</span>
          ))}
        </div>

        {/* Mobile: list toggle & station sheet */}
        <div className="lg:hidden absolute z-[650] left-1/2 -translate-x-1/2 bottom-4">
          {!selected && (
            <Button className="shadow-pop rounded-full" onClick={() => setView(view === 'map' ? 'list' : 'map')}>
              {view === 'map' ? <><List className="size-4" /> List ({stations.length})</> : <><MapIcon className="size-4" /> Map</>}
            </Button>
          )}
        </div>
        {!isDesktop && view === 'list' && !selected && <div className="absolute inset-0 top-[124px] z-[620] bg-bg animate-in">{listPanel}</div>}
        {!isDesktop && selected && (
          <div className="absolute inset-x-0 bottom-0 z-[700] max-h-[72%] h-[72%] rounded-t-3xl bg-surface border-t border-border shadow-pop animate-in overflow-hidden">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3" />
            <StationPanel station={selected} origin={origin} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-[2500]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-surface shadow-pop animate-in">
            <FilterPanel f={filters} set={setFilters} onClose={() => setFiltersOpen(false)} resultCount={stations.length} />
          </div>
        </div>
      )}
    </div>
  );
}
