'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Car, Check, Columns3, LocateFixed, MapPin, Sparkles, Trophy } from 'lucide-react';
import { RECOMMENDATION_MODES, formatDistance, formatDuration, formatMoney, type RecommendationMode } from '@voltway/shared';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGeolocation } from '@/lib/geo';
import { useDebounced } from '@/lib/hooks';
import { useLiveStations } from '@/lib/useLiveStations';
import { cn } from '@/lib/format';
import type { Station } from '@/lib/types';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Modal, Segmented, SkeletonList, Slider, Table } from '@/components/ui';
import { StationCard } from '@/components/station/StationCard';
import { SearchBox } from '@/components/station/SearchBox';
import { DEFAULT_FILTERS, FilterPanel, QuickFilters, type FilterState } from '@/components/station/Filters';
import { EstimatedTag, SourceBadge, TrafficBadge } from '@/components/station/badges';
import { OUTCOME_STYLE } from '@/components/station/community';
import { useFetch } from '@/lib/hooks';
import { CHECKIN_OUTCOMES, CHECKIN_PROBLEMS, type CheckinOutcome, type CheckinProblem } from '@voltway/shared';
import { timeAgo } from '@/lib/format';

const MODES: RecommendationMode[] = ['balanced', 'fastest', 'closest', 'cheapest', 'least_wait'];

export default function NearbyPage() {
  const { me } = useAuth();
  const geo = useGeolocation();
  const [place, setPlace] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const origin = place ?? (geo.position ? { ...geo.position, label: geo.isFallback ? 'Lahore (demo region)' : 'Your location' } : null);
  const [tab, setTab] = useState<'smart' | 'all' | 'activity'>('smart');
  const [mode, setMode] = useState<RecommendationMode>('balanced');
  const [startSoc, setStartSoc] = useState(30);
  const [targetSoc, setTargetSoc] = useState(80);
  useEffect(() => { if (me.defaultVehicle) { setStartSoc(me.defaultVehicle.current_soc); setTargetSoc(Math.max(me.defaultVehicle.target_soc, me.defaultVehicle.current_soc + 5)); } }, [me.defaultVehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const soc = useDebounced({ startSoc, targetSoc }, 350);
  const [reco, setReco] = useState<any>(null);
  const [recoErr, setRecoErr] = useState<any>(null);
  const [recoLoading, setRecoLoading] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allErr, setAllErr] = useState<any>(null);
  useLiveStations(setStations);

  const loadReco = () => {
    if (!origin) return;
    setRecoLoading(true);
    api.post('/recommendations', { lat: origin.lat, lng: origin.lng, mode, startSoc: soc.startSoc, targetSoc: soc.targetSoc, radiusKm: 30 })
      .then((d) => { setReco(d); setRecoErr(null); }).catch(setRecoErr).finally(() => setRecoLoading(false));
  };
  useEffect(() => { if (tab === 'smart') loadReco(); }, [origin?.lat, origin?.lng, mode, soc, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAll = () => {
    if (!origin) return;
    setAllLoading(true);
    api.get(`/stations${qs({ lat: origin.lat, lng: origin.lng, radiusKm: filters.radiusKm, connectors: filters.connectors, currentTypes: filters.currentTypes, minPowerKw: filters.minPowerKw || null, maxPrice: filters.maxPrice, available: filters.available, openNow: filters.openNow, is247: filters.is247, amenities: filters.amenities, networks: filters.networks, minScore: filters.minScore || null, comingSoon: filters.comingSoon, locationTypes: filters.locationTypes, sort: filters.sort, limit: 100 })}`)
      .then((d) => { setStations(d.stations); setAllErr(null); }).catch(setAllErr).finally(() => setAllLoading(false));
  };
  useEffect(() => { if (tab === 'all') loadAll(); }, [origin?.lat, origin?.lng, filters, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const recs: any[] = reco?.recommendations ?? [];
  const compared = recs.filter((r) => compare.includes(r.stationId));

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nearby chargers</h1>
          <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
            <MapPin className="size-3.5" />{origin ? origin.label : 'Locating…'}
            {geo.isFallback && !place && geo.status !== 'denied' && <button onClick={geo.request} className="text-electric font-medium ml-1 inline-flex items-center gap-1"><LocateFixed className="size-3.5" />Use my location</button>}
          </p>
        </div>
        <SearchBox className="md:w-96" placeholder="Search near another place…" onPick={(r) => setPlace({ lat: r.lat, lng: r.lng, label: r.name })} />
      </div>

      <Segmented value={tab} onChange={setTab} options={[{ value: 'smart', label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5" />Smart picks</span> }, { value: 'all', label: 'All nearby' }, { value: 'activity', label: 'Recent activity' }]} className="mb-4" />

      {tab === 'activity' ? <ActivityFeed origin={origin} /> : tab === 'smart' ? (
        <>
          <Card className="p-4 mb-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 md:w-56">
                <div className="size-10 rounded-xl bg-surface-2 grid place-items-center"><Car className="size-5 text-muted" /></div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{reco?.vehicle?.name ?? (me.defaultVehicle ? `${me.defaultVehicle.brand} ${me.defaultVehicle.model}` : 'Generic EV (60 kWh)')}</div>
                  {reco?.usingDefaultVehicle && <Link href={me.user ? '/profile' : '/login'} className="text-xs text-accent">Add your car for accurate results</Link>}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-5">
                <div><div className="flex justify-between text-[13px] mb-2"><span className="text-muted">Battery now</span><b className="tabular">{startSoc}%</b></div><Slider value={startSoc} onChange={(v) => setStartSoc(Math.min(v, 95))} accent="var(--warning)" /></div>
                <div><div className="flex justify-between text-[13px] mb-2"><span className="text-muted">Charge to</span><b className="tabular">{targetSoc}%</b></div><Slider value={targetSoc} onChange={(v) => setTargetSoc(Math.max(v, startSoc + 5))} /></div>
              </div>
            </div>
          </Card>
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
            {MODES.map((m) => <Chip key={m} active={mode === m} onClick={() => setMode(m)}>{RECOMMENDATION_MODES[m].label}</Chip>)}
          </div>
          <p className="text-xs text-muted mb-3">{RECOMMENDATION_MODES[mode].description}. Ranking uses drive time, waiting time, charging curve, price right now and availability. All times and costs are estimates.</p>
          {recoErr ? <ErrorState error={recoErr} onRetry={loadReco} /> : recoLoading && !reco ? <SkeletonList rows={4} /> : recs.length === 0 ? (
            <EmptyState title="No compatible stations within 30 km" body="Try another area or check your vehicle's connector types in your profile." />
          ) : (
            <div className={cn('space-y-3 transition-opacity', recoLoading && 'opacity-60')}>
              {recs.map((r) => {
                const checked = compare.includes(r.stationId);
                return (
                  <Card key={r.stationId} className={cn('p-4', r.rank === 1 && 'border-accent/50')}>
                    <div className="flex items-start gap-3">
                      <div className={cn('size-10 shrink-0 rounded-xl grid place-items-center font-semibold', r.rank === 1 ? 'bg-accent text-white' : 'bg-surface-2 text-muted')}>{r.rank === 1 ? <Trophy className="size-5" /> : `#${r.rank}`}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/stations/${r.stationId}`} className="font-semibold hover:underline">{r.name}</Link>
                          {r.badges.map((b: string) => <Badge key={b} tone="green">{b}</Badge>)}
                        </div>
                        <div className="text-[13px] text-muted">{r.station.operator.name} · {r.station.address}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                          <Mini label="Drive" value={`${formatDuration(r.travelMinutes)}`} sub={formatDistance(r.distanceKm)} />
                          <Mini label="Wait" value={r.estimatedWaitMinutes ? `~${Math.round(r.estimatedWaitMinutes)} min` : 'None'} sub={`${r.availableCompatiblePorts}/${r.compatiblePorts} free`} />
                          <Mini label="Charge" value={formatDuration(r.chargeMinutes)} sub={`${r.bestPowerKw} kW ${r.currentType}`} />
                          <Mini label="Total time" value={formatDuration(r.totalMinutes)} sub="drive + wait + charge" strong />
                          <Mini label="Cost" value={formatMoney(r.chargeCost, r.currency)} sub={`${formatMoney(r.pricePerKwh, r.currency)}/kWh now`} strong />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {r.trafficLevel && <TrafficBadge level={r.trafficLevel} source="estimated" />}
                          <SourceBadge source={r.station.status.source} updatedAt={r.station.status.updatedAt} stale={r.station.status.stale} compact />
                          <span className="text-xs text-muted">{r.reasons.join(' · ')}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right"><div className="text-xl font-semibold tabular">{r.score}</div><div className="text-[10.5px] text-muted -mt-1">score</div></div>
                        <button onClick={() => setCompare((c) => (checked ? c.filter((x) => x !== r.stationId) : c.length >= 4 ? c : [...c, r.stationId]))}
                          className={cn('inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border text-xs font-medium', checked ? 'bg-electric text-white border-electric' : 'border-border text-muted hover:text-text')}>
                          {checked ? <Check className="size-3" /> : <Columns3 className="size-3" />}Compare
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {compare.length >= 2 && (
            <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[1200] animate-in">
              <Button variant="electric" className="shadow-pop rounded-full" onClick={() => setCompareOpen(true)}><Columns3 className="size-4" /> Compare {compare.length} stations</Button>
            </div>
          )}
          <Modal open={compareOpen} onClose={() => setCompareOpen(false)} title="Compare stations" wide>
            <Table>
              <thead><tr><th></th>{compared.map((r) => <th key={r.stationId} className="!normal-case !text-text !text-sm">{r.name}</th>)}</tr></thead>
              <tbody>
                {([
                  ['Rank / score', (r: any) => `#${r.rank} · ${r.score}`],
                  ['Distance', (r: any) => formatDistance(r.distanceKm)],
                  ['Drive time', (r: any) => formatDuration(r.travelMinutes)],
                  ['Free compatible ports', (r: any) => `${r.availableCompatiblePorts}/${r.compatiblePorts}`],
                  ['Est. wait', (r: any) => (r.estimatedWaitMinutes ? `~${Math.round(r.estimatedWaitMinutes)} min` : 'None')],
                  ['Best charger', (r: any) => `${r.bestPowerKw} kW ${r.currentType}`],
                  [`Charge ${startSoc}→${targetSoc}%`, (r: any) => formatDuration(r.chargeMinutes)],
                  ['Total time', (r: any) => formatDuration(r.totalMinutes)],
                  ['Price now', (r: any) => `${formatMoney(r.pricePerKwh, r.currency)}/kWh`],
                  ['Est. cost', (r: any) => formatMoney(r.chargeCost, r.currency)],
                  ['Rating', (r: any) => (r.rating ? `${r.rating.toFixed(1)} ★` : '—')],
                  ['Status data', (r: any) => <SourceBadge source={r.station.status.source} updatedAt={r.station.status.updatedAt} compact />],
                ] as [string, (r: any) => any][]).map(([label, fn]) => (
                  <tr key={label}><td className="text-muted whitespace-nowrap">{label}</td>{compared.map((r) => <td key={r.stationId} className="tabular">{fn(r)}</td>)}</tr>
                ))}
              </tbody>
            </Table>
            <p className="text-xs text-muted mt-3">Times and costs are estimates.<EstimatedTag /></p>
          </Modal>
        </>
      ) : (
        <>
          <div className="mb-4"><QuickFilters f={filters} set={setFilters} onOpen={() => setFiltersOpen(true)} vehicleConnectors={me.defaultVehicle?.connectors} /></div>
          {allErr ? <ErrorState error={allErr} onRetry={loadAll} /> : allLoading && !stations.length ? <SkeletonList rows={5} /> : stations.length === 0 ? (
            <EmptyState title="No stations match" body="Widen the distance or remove filters." action={<Button variant="outline" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</Button>} />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">{stations.map((s) => <StationCard key={s.id} s={s} href={`/stations/${s.id}`} />)}</div>
          )}
          {filtersOpen && (
            <div className="fixed inset-0 z-[2500]">
              <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
              <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-surface shadow-pop animate-in"><FilterPanel f={filters} set={setFilters} onClose={() => setFiltersOpen(false)} resultCount={stations.length} showRadius /></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Mini({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-xl p-2.5', strong ? 'bg-electric-soft' : 'bg-surface-2')}>
      <div className="text-[11px] text-muted font-medium">{label}</div>
      <div className="text-[14px] font-semibold tabular leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted leading-tight">{sub}</div>}
    </div>
  );
}

function ActivityFeed({ origin }: { origin: { lat: number; lng: number } | null }) {
  const { data, error, loading, reload } = useFetch<any>(origin ? `/activity?lat=${origin.lat}&lng=${origin.lng}&radiusKm=60` : '/activity');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading) return <SkeletonList rows={5} />;
  if (!data.activity.length) return <EmptyState title="No recent check-ins nearby" body="Check in after charging to help other drivers." />;
  return (
    <Card className="divide-y divide-border">
      {data.activity.map((a: any) => {
        const S = OUTCOME_STYLE[a.outcome as CheckinOutcome];
        return (
          <div key={a.id} className="flex gap-3 p-4">
            <span className={cn('size-9 shrink-0 rounded-xl grid place-items-center', S.cls)}><S.icon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2"><Link href={`/stations/${a.station_id}`} className="text-sm font-semibold hover:underline truncate">{a.station_name}</Link><span className="text-xs text-subtle whitespace-nowrap">{timeAgo(a.created_at)}</span></div>
              <div className="text-[13px]"><span className="font-medium">{CHECKIN_OUTCOMES[a.outcome as CheckinOutcome]}</span>{a.problem && <span className="text-danger"> · {CHECKIN_PROBLEMS[a.problem as CheckinProblem]}</span>}<span className="text-muted"> · {a.author}{a.vehicle_label ? `, ${a.vehicle_label}` : ''}{a.kw_observed ? ` · ${a.kw_observed} kW` : ''} · {a.city}</span></div>
              {a.comment && <p className="text-sm text-muted mt-0.5">{a.comment}</p>}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
