'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BadgeCheck, BellRing, Clock, ExternalLink, Heart, Hourglass, Star, X, Zap } from 'lucide-react';
import { AMENITY_LABELS, CONNECTOR_LABELS, formatDistance, formatDuration, formatMoney, type Amenity } from '@voltway/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { clockTime, cn } from '@/lib/format';
import type { Station } from '@/lib/types';
import { Badge, Button } from '@/components/ui';
import { EstimatedTag, OperationalBadge, SourceBadge, TrafficBadge } from './badges';
import { connectorGroups } from './StationCard';
import { DirectionsButton } from './Directions';

export function StationPanel({ station: s, origin, onClose }: { station: Station; origin: { lat: number; lng: number } | null; onClose: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const [fav, setFav] = useState(false);
  const [eta, setEta] = useState<any>(null);
  const [quick, setQuick] = useState<any>(null);
  useEffect(() => {
    setEta(null); setQuick(null);
    if (me.user) api.get(`/stations/${s.id}`).then((d) => setFav(d.favorite)).catch(() => {});
    if (origin) api.get(`/stations/${s.id}/eta?lat=${origin.lat}&lng=${origin.lng}`).then(setEta).catch(() => {});
    const best = [...s.ports].filter((p) => p.compatible).sort((a, b) => b.maxPowerKw - a.maxPowerKw)[0];
    if (best && me.defaultVehicle) {
      api.post('/estimate', { portId: best.id, vehicleId: me.defaultVehicle.id, startSoc: me.defaultVehicle.current_soc, targetSoc: Math.max(me.defaultVehicle.target_soc, me.defaultVehicle.current_soc + 5), compareWindows: false })
        .then((r) => setQuick({ ...r.estimate, port: best })).catch(() => {});
    }
  }, [s.id, me.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFav = async () => {
    if (!me.user) return toast('info', 'Sign in to save favorites');
    try {
      if (fav) await api.del(`/me/favorites/${s.id}`); else await api.put(`/me/favorites/${s.id}`);
      setFav(!fav);
      toast('success', fav ? 'Removed from favorites' : 'Saved to favorites', fav ? undefined : 'You will be notified about outages and price changes.');
    } catch (e: any) { toast('error', e.message); }
  };
  const watch = async () => {
    if (!me.user) return toast('info', 'Sign in to get availability alerts');
    await api.post(`/stations/${s.id}/watch`, { connectorTypes: me.defaultVehicle?.connectors ?? [], hours: 2 });
    toast('success', 'We will notify you', 'You get an alert when a compatible charger frees up (next 2 hours).');
  };

  const distance = eta?.distanceKm ?? s.travel?.distanceKm;
  const minutes = eta?.durationMin ?? s.travel?.travelMinutes;
  const traffic = eta?.traffic ?? s.travel?.traffic;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-3 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[17px] leading-snug">{s.name}</h2>
            <div className="text-[13px] text-muted flex items-center gap-1 mt-0.5">
              <span className="size-2 rounded-full" style={{ background: s.operator.brandColor }} />
              {s.operator.name}{s.operator.verified && <BadgeCheck className="size-3.5 text-electric" aria-label="Verified operator" />}
              {s.rating != null && <span className="ml-2 inline-flex items-center gap-0.5"><Star className="size-3 fill-warning text-warning" />{s.rating.toFixed(1)} ({s.reviewCount})</span>}
            </div>
            <div className="text-[13px] text-muted truncate">{s.address}, {s.city}</div>
          </div>
          <button onClick={toggleFav} aria-label={fav ? 'Remove favorite' : 'Save favorite'} className="size-9 grid place-items-center rounded-xl hover:bg-surface-2">
            <Heart className={cn('size-5', fav ? 'fill-danger text-danger' : 'text-muted')} />
          </button>
          <button onClick={onClose} aria-label="Close" className="size-9 grid place-items-center rounded-xl hover:bg-surface-2 text-muted"><X className="size-5" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <OperationalBadge status={s.status.operational} />
          <SourceBadge source={s.status.source} updatedAt={s.status.updatedAt} stale={s.status.stale} />
          <Badge tone={s.openNow.open === false ? 'red' : 'neutral'}><Clock className="size-3" />{s.openNow.label}</Badge>
          {s.isDemo && <Badge tone="outline">Demo listing</Badge>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {s.maintenanceMode && <div className="rounded-xl bg-violet-soft text-violet text-[13px] p-3">{s.maintenanceNote ?? 'This station is under maintenance.'}</div>}
        <div className="grid grid-cols-2 gap-2">
          <Fact label="Drive" value={distance != null ? `${formatDistance(distance)} · ${formatDuration(minutes)}` : 'Enable location'} sub={eta ? `Arrive ~${clockTime(eta.arriveAt)}${eta.approximate ? ' · approx. route' : ''}` : s.travel ? 'Estimated' : undefined} est={!eta || eta.approximate} />
          <Fact label="Price now" value={s.pricing ? `${formatMoney(s.pricing.currentRate, s.pricing.currency)}/kWh` : 'Not listed'} sub={s.pricing ? `${s.pricing.periodLabel}${s.pricing.sessionFee ? ` · +${formatMoney(s.pricing.sessionFee, s.pricing.currency)} session` : ''}` : undefined} />
          <Fact label="Max power" value={`${Math.round(s.maxPowerKw)} kW`} sub={[s.hasDC && 'DC fast', s.hasAC && 'AC'].filter(Boolean).join(' · ')} />
          <Fact label="Wait time" value={s.estimatedWaitMinutes == null ? '—' : s.estimatedWaitMinutes === 0 ? 'No wait' : `~${s.estimatedWaitMinutes} min`} sub={s.compatibleAvailable ? `${s.compatibleAvailable} compatible free` : 'All compatible ports busy'} est />
        </div>
        {traffic && <TrafficBadge level={traffic.level} source={traffic.source} />}
        {quick && (
          <div className="rounded-xl border border-border p-3 flex items-center gap-3">
            <div className="size-9 rounded-lg bg-electric-soft text-electric grid place-items-center"><Hourglass className="size-4" /></div>
            <div className="text-[13px] min-w-0">
              <div className="font-medium">{me.defaultVehicle.current_soc}% → {Math.max(me.defaultVehicle.target_soc, me.defaultVehicle.current_soc + 5)}% in ~{formatDuration(quick.durationMinutes)}<EstimatedTag /></div>
              <div className="text-muted truncate">{me.defaultVehicle.brand} {me.defaultVehicle.model} on {quick.port.label} ({quick.port.maxPowerKw} kW){quick.cost ? ` · ${formatMoney(quick.cost.total, quick.cost.currency)}` : ''}</div>
            </div>
          </div>
        )}
        <div>
          <h3 className="text-[13px] font-semibold mb-2">Connectors</h3>
          <div className="space-y-1.5">
            {connectorGroups(s).map((g) => (
              <div key={`${g.type}${g.kw}`} className={cn('flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2', !g.compatible && 'opacity-55')}>
                <Zap className={cn('size-4', g.current === 'DC' ? 'text-electric' : 'text-accent')} />
                <div className="flex-1 text-[13px]"><span className="font-medium">{CONNECTOR_LABELS[g.type]}</span> <span className="text-muted">· {g.kw} kW {g.current}</span>{!g.compatible && <span className="text-[11px] text-danger ml-1.5">not compatible</span>}</div>
                <span className={cn('text-[13px] font-semibold tabular', g.available ? 'text-accent' : 'text-subtle')}>{g.available}/{g.total} free</span>
              </div>
            ))}
          </div>
        </div>
        {s.amenities.length > 0 && (
          <div>
            <h3 className="text-[13px] font-semibold mb-2">Amenities</h3>
            <div className="flex flex-wrap gap-1.5">{s.amenities.map((a) => <Badge key={a}>{AMENITY_LABELS[a as Amenity] ?? a}</Badge>)}</div>
          </div>
        )}
        {s.compatibleAvailable === 0 && s.compatibleWorking > 0 && (
          <Button variant="outline" className="w-full" onClick={watch}><BellRing className="size-4" /> Notify me when a charger is free</Button>
        )}
      </div>
      <div className="p-3 border-t border-border grid grid-cols-2 gap-2">
        <DirectionsButton lat={s.lat} lng={s.lng} label={s.name} />
        <Link href={`/stations/${s.id}`}><Button variant="outline" className="w-full">Details <ExternalLink className="size-3.5" /></Button></Link>
      </div>
    </div>
  );
}

function Fact({ label, value, sub, est }: { label: string; value: string; sub?: string; est?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <div className="text-[11.5px] text-muted font-medium">{label}{est && <EstimatedTag />}</div>
      <div className="text-[14px] font-semibold mt-0.5 tabular leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}
