'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, CalendarClock, Car, CircleDollarSign, Clock, CreditCard, Flag, Heart, Info, MapPin, Phone, PlugZap, Share2, ShieldCheck, Star, Zap,
} from 'lucide-react';
import {
  AMENITY_LABELS, PAYMENT_METHOD_LABELS, formatDistance, formatDuration, formatMoney, type Amenity, type PaymentMethodKind,
} from '@voltway/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGeolocation } from '@/lib/geo';
import { useFetch } from '@/lib/hooks';
import { useRealtime } from '@/lib/realtime';
import { useToast } from '@/lib/toast';
import { clockTime, cn, dateTime, timeAgo } from '@/lib/format';
import type { Port, Station, Vehicle } from '@/lib/types';
import { Map } from '@/components/map';
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, Select, Skeleton, Slider, Textarea } from '@/components/ui';
import { EstimatedTag, OperationalBadge, SourceBadge, TrafficBadge } from '@/components/station/badges';
import { PortList } from '@/components/station/PortList';
import { PriceSchedule } from '@/components/station/PriceSchedule';
import { Estimator } from '@/components/station/Estimator';
import { Forecast } from '@/components/station/Forecast';
import { Reviews, Stars } from '@/components/station/Reviews';
import { DirectionsButton } from '@/components/station/Directions';
import { CommunitySection, PhotoGallery, ReliabilityBadge } from '@/components/station/community';
import { LOCATION_TYPES, type LocationType } from '@voltway/shared';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function StationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const toast = useToast();
  const geo = useGeolocation();
  const origin = geo.position && !geo.isFallback ? geo.position : null;
  const { data, error, loading, reload, setData } = useFetch<{ station: Station; favorite: boolean; watching: boolean; activeSessions: number }>(
    `/stations/${id}${origin ? `?lat=${origin.lat}&lng=${origin.lng}` : ''}`, [origin?.lat],
  );
  const [eta, setEta] = useState<any>(null);
  const [selectedPort, setSelectedPort] = useState<Port | null>(null);
  const [modal, setModal] = useState<'start' | 'reserve' | 'report' | null>(null);
  const s = data?.station;

  useEffect(() => {
    if (origin && s) api.get(`/stations/${s.id}/eta?lat=${origin.lat}&lng=${origin.lng}`).then(setEta).catch(() => setEta(null));
  }, [origin?.lat, s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtime(s ? `station:${s.id}` : null, (event, d) => {
    if (event !== 'port.status' || !data) return;
    setData({ ...data, station: { ...data.station, ports: data.station.ports.map((p) => (p.id === d.portId ? { ...p, status: d.status, statusSource: d.source, statusUpdatedAt: d.updatedAt, statusStale: false } : p)), summary: d.summary, status: { ...data.station.status, operational: d.summary.operationalStatus, source: d.source, updatedAt: d.updatedAt, stale: false } } });
  });

  if (error) return <ErrorState error={error} onRetry={reload} className="py-24" />;
  if (loading || !s) return <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4"><Skeleton className="h-56" /><div className="grid lg:grid-cols-3 gap-4"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-96" /></div></div>;

  const toggleFav = async () => {
    if (!me.user) return router.push(`/login?next=/stations/${s.id}`);
    if (data!.favorite) await api.del(`/me/favorites/${s.id}`); else await api.put(`/me/favorites/${s.id}`);
    setData({ ...data!, favorite: !data!.favorite });
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: s.name, url });
      else { await navigator.clipboard.writeText(url); toast('success', 'Link copied'); }
    } catch { /* cancelled */ }
  };
  const t = s.tariff;
  const cur = s.pricing?.currency ?? 'PKR';

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <button onClick={() => (history.length > 1 ? router.back() : router.push('/'))} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text mb-4"><ArrowLeft className="size-4" /> Back</button>

      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[1fr_360px]">
          <div className="p-5 md:p-6">
            <div className="flex flex-wrap gap-1.5 mb-3">
              <OperationalBadge status={s.status.operational} />
              <SourceBadge source={s.status.source} updatedAt={s.status.updatedAt} stale={s.status.stale} />
              <Badge tone={s.openNow.open === false ? 'red' : 'green'}><Clock className="size-3" />{s.openNow.label}</Badge>
              {s.listingStatus !== 'approved' && <Badge tone="amber">Listing {s.listingStatus}</Badge>}
              {s.isDemo && <Badge tone="outline">Demo listing</Badge>}
              {s.community && <Badge tone="outline">Added by drivers</Badge>}
              {s.locationType !== 'public' && <Badge tone="outline">{LOCATION_TYPES[s.locationType as LocationType]}</Badge>}
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{s.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: s.operator.brandColor }} />{s.operator.name}{s.operator.verified && <BadgeCheck className="size-4 text-electric" />}</span>
              {s.rating != null && <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-warning text-warning" />{s.rating.toFixed(1)} · {s.reviewCount} reviews</span>}
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{s.address}, {s.city}</span>
            </div>
            {s.description && <p className="text-sm text-muted mt-3 max-w-2xl">{s.description}</p>}
            {s.hostNotes && <p className="text-sm mt-2 max-w-2xl whitespace-pre-line rounded-xl bg-surface-2 p-3">{s.hostNotes}</p>}
            {s.comingSoon && <div className="mt-3 rounded-xl border border-dashed border-border p-3 text-sm"><b>Coming soon.</b> This station has been reported as planned or under construction. Details may change; it can&apos;t be used yet.</div>}
            {!s.comingSoon && <div className="mt-4"><ReliabilityBadge score={s.reliability.score} checkins={s.reliability.checkins} showLabel /></div>}
            {s.maintenanceMode && <div className="mt-3 rounded-xl bg-violet-soft text-violet text-sm p-3">{s.maintenanceNote ?? 'Under maintenance.'}</div>}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
              <HeroFact icon={Zap} label="Available" value={`${s.summary.available}/${s.summary.total} ports`} sub={me.defaultVehicle ? `${s.compatibleAvailable} compatible free` : undefined} />
              <HeroFact icon={PlugZap} label="Max power" value={`${Math.round(s.maxPowerKw)} kW`} sub={[s.hasDC && 'DC', s.hasAC && 'AC'].filter(Boolean).join(' + ')} />
              <HeroFact icon={CircleDollarSign} label="Price now" value={s.pricing ? `${formatMoney(s.pricing.currentRate, cur)}` : '—'} sub={s.pricing ? `per kWh · ${s.pricing.periodLabel}` : 'Not listed'} />
              <HeroFact icon={Car} label="Drive" value={eta ? formatDuration(eta.durationMin) : s.travel ? formatDuration(s.travel.travelMinutes) : '—'} sub={eta ? `${formatDistance(eta.distanceKm)} · arrive ${clockTime(eta.arriveAt)}` : s.travel ? formatDistance(s.travel.distanceKm) : 'Enable location'} est={!eta || eta.approximate} />
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              <Button size="lg" onClick={() => (me.user ? setModal('start') : router.push(`/login?next=/stations/${s.id}`))} disabled={!s.integration.supportsRemoteStart || s.maintenanceMode}
                title={s.integration.supportsRemoteStart ? undefined : 'This station does not support app-started sessions'}>
                <PlugZap className="size-4" /> Start charging
              </Button>
              {s.reservationsEnabled && <Button size="lg" variant="outline" onClick={() => (me.user ? setModal('reserve') : router.push(`/login?next=/stations/${s.id}`))}><CalendarClock className="size-4" /> Reserve</Button>}
              <DirectionsButton lat={s.lat} lng={s.lng} label={s.name} size="lg" className="min-w-36" />
              <Button size="lg" variant="ghost" onClick={toggleFav} aria-label="Favorite"><Heart className={cn('size-4', data!.favorite && 'fill-danger text-danger')} />{data!.favorite ? 'Saved' : 'Save'}</Button>
              <Button size="lg" variant="ghost" onClick={share} aria-label="Share"><Share2 className="size-4" /></Button>
            </div>
            {!s.integration.supportsRemoteStart && <p className="text-xs text-muted mt-2">App start isn&apos;t available here yet — start at the charger using {s.paymentMethods.map((m) => PAYMENT_METHOD_LABELS[m as PaymentMethodKind] ?? m).join(', ').toLowerCase() || 'its payment options'}.</p>}
          </div>
          <div className="h-56 md:h-auto min-h-56 border-t md:border-t-0 md:border-l border-border relative">
            {s.images[0] ? <img src={s.images[0]} alt={s.name} className="absolute inset-0 w-full h-full object-cover" /> : (
              <Map center={{ lat: s.lat, lng: s.lng }} zoom={14} stations={[s]} selectedId={s.id} user={origin}
                routes={eta ? [{ id: 'eta', geometry: eta.geometry, active: true, approximate: eta.approximate }] : []}
                fit={eta ? { points: eta.geometry, key: s.id } : null} />
            )}
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-[1fr_380px] gap-4 mt-4">
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader title="Charging ports" subtitle={`${s.summary.total} ports · ${s.summary.available} available · ${s.summary.inUse} in use${s.summary.reserved ? ` · ${s.summary.reserved} reserved` : ''}${s.summary.outOfService + s.summary.offline + s.summary.noPower ? ` · ${s.summary.outOfService + s.summary.offline + s.summary.noPower} unavailable` : ''}`}
              action={me.user && <Button size="sm" variant="ghost" onClick={() => setModal('report')}><Flag className="size-3.5" /> Report issue</Button>} />
            <div className="px-5 pb-5">
              <PortList ports={s.ports} onSelect={(p) => setSelectedPort(p)} selectedId={selectedPort?.id} />
              <p className="text-xs text-muted mt-3 flex gap-1.5"><Info className="size-3.5 shrink-0 mt-0.5" />
                {s.status.source === 'live' ? 'Port status comes live from the charger network.' : s.status.source === 'simulated' ? 'Port status comes from the built-in demo simulator — it is not real-time data.' : 'This station has no live data connection. Status is as last reported and may be out of date.'}
                {s.estimatedWaitMinutes ? ` Estimated wait for a compatible port: ~${s.estimatedWaitMinutes} min.` : ''}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Driver check-ins" subtitle="How charging went for other drivers — the basis of the reliability score." />
            <div className="px-5 pb-5"><CommunitySection station={s} onChanged={() => reload(true)} /></div>
          </Card>

          <Card>
            <CardHeader title="Photos" />
            <div className="px-5 pb-5"><PhotoGallery station={s} /></div>
          </Card>

          <Card>
            <CardHeader title="Charging time & cost estimator" subtitle="Uses your car's charging curve — rated charger power is not always what your car receives." />
            <div className="px-5 pb-5"><Estimator station={s} initialPortId={selectedPort?.compatible ? selectedPort.id : null} /></div>
          </Card>

          <Card>
            <CardHeader title="Pricing" subtitle={s.pricing ? `${s.pricing.tariffName} · updated ${timeAgo(s.pricing.updatedAt)}` : undefined} action={s.pricing && <SourceBadge source="operator_reported" updatedAt={s.pricing.updatedAt} compact />} />
            <div className="px-5 pb-5 space-y-5">
              {!t ? <p className="text-sm text-muted">The operator hasn&apos;t published prices for this station.</p> : (
                <>
                  <div className="flex items-end gap-3">
                    <div className="text-3xl font-semibold tabular">{formatMoney(s.pricing!.currentRate, cur)}<span className="text-base text-muted font-normal">/kWh</span></div>
                    <Badge tone={s.pricing!.periodKind === 'peak' ? 'red' : s.pricing!.periodKind.includes('off_peak') ? 'green' : 'blue'}>{s.pricing!.periodLabel} · now</Badge>
                  </div>
                  <PriceSchedule stationId={s.id} currency={cur} />
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <PriceRow k="Standard rate" v={`${formatMoney(t.baseRate, cur)}/kWh`} />
                    {t.weekendRate != null && <PriceRow k="Weekend rate" v={`${formatMoney(t.weekendRate, cur)}/kWh`} />}
                    {t.periods.map((p) => <PriceRow key={p.label} k={`${p.label} (${p.start}–${p.end}${p.days?.length ? `, ${p.days.map((d) => DAYS[d].slice(0, 3)).join('/')}` : ''})`} v={`${formatMoney(p.rate, cur)}/kWh`} tone={p.kind === 'peak' ? 'text-danger' : 'text-accent'} />)}
                    <PriceRow k="Session fee" v={t.sessionFee ? formatMoney(t.sessionFee, cur) : 'None'} />
                    <PriceRow k="Parking fee" v={t.parkingFeePerHour ? `${formatMoney(t.parkingFeePerHour, cur)}/h` : 'Free while charging'} />
                    <PriceRow k="Idle fee" v={t.idleFeePerMinute ? `${formatMoney(t.idleFeePerMinute, cur)}/min after ${t.idleGraceMinutes} min` : 'None'} />
                    {t.timeFeePerMinute > 0 && <PriceRow k="Time fee" v={`${formatMoney(t.timeFeePerMinute, cur)}/min`} />}
                    <PriceRow k="Service charge" v={t.serviceChargePercent ? `${t.serviceChargePercent}%` : 'None'} />
                    <PriceRow k="Tax" v={t.taxPercent ? `${t.taxPercent}% added` : 'Included / n.a.'} />
                  </div>
                  {(t.seasonal.length > 0 || t.discounts.length > 0 || t.dynamic.enabled) && (
                    <div className="flex flex-wrap gap-2">
                      {t.seasonal.map((x) => <Badge key={x.label} tone="amber">{x.label}: ×{x.multiplier} (months {x.startMonth}–{x.endMonth})</Badge>)}
                      {t.discounts.map((x) => <Badge key={x.label} tone="green">{x.label}: −{x.percent}%{x.start ? ` ${x.start}–${x.end}` : ''}</Badge>)}
                      {t.dynamic.enabled && <Badge tone="violet">Dynamic pricing ×{t.dynamic.minMultiplier}–{t.dynamic.maxMultiplier} with demand</Badge>}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Popular times" subtitle="How busy this station usually is" />
            <div className="px-5 pb-5"><Forecast stationId={s.id} timezone={s.timezone} /></div>
          </Card>

          <Card>
            <CardHeader title="Reviews" />
            <div className="px-5 pb-5"><Reviews stationId={s.id} rating={s.rating} count={s.reviewCount} /></div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Location & directions" />
            <div className="px-5 pb-5 space-y-3 text-sm">
              <div><div className="font-medium">{s.address}</div><div className="text-muted">{s.city}{s.region ? `, ${s.region}` : ''} · {s.country}</div><div className="text-xs text-subtle mt-1 font-mono">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</div></div>
              {eta ? (
                <div className="rounded-xl bg-surface-2 p-3 space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted">Distance</span><span className="font-medium">{formatDistance(eta.distanceKm)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Drive time</span><span className="font-medium">{formatDuration(eta.durationMin)}{eta.approximate && <EstimatedTag />}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Arrive around</span><span className="font-medium">{clockTime(eta.arriveAt)}</span></div>
                  <TrafficBadge level={eta.traffic.level} source={eta.traffic.source} />
                  {eta.approximate && <p className="text-xs text-muted">No routing service reachable — distance and time are approximate.</p>}
                </div>
              ) : <p className="text-muted text-[13px]">{geo.status === 'denied' ? 'Location is blocked — distance unavailable.' : 'Allow location to see distance and arrival time.'}</p>}
              <DirectionsButton lat={s.lat} lng={s.lng} label={s.name} />
              {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-2 text-muted hover:text-text"><Phone className="size-4" />{s.phone}</a>}
              {s.parkingInfo && <p className="text-muted text-[13px]">🅿︎ {s.parkingInfo}</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Opening hours" action={<Badge tone={s.openNow.open === false ? 'red' : 'green'}>{s.openNow.label}</Badge>} />
            <div className="px-5 pb-5 text-sm">
              {s.is24_7 ? <p className="font-medium flex items-center gap-2"><ShieldCheck className="size-4 text-accent" />Open 24 hours, 7 days a week</p> : s.openingHours.length === 0 ? <p className="text-muted">Not provided by the operator.</p> : (
                <ul className="space-y-1">{DAYS.map((d, i) => {
                  const h = s.openingHours.filter((x) => x.day === i);
                  return <li key={d} className="flex justify-between"><span className="text-muted">{d}</span><span className="tabular">{h.length ? h.map((x) => `${x.open}–${x.close}`).join(', ') : 'Closed'}</span></li>;
                })}</ul>
              )}
              <p className="text-xs text-subtle mt-2">Times in station local time ({s.timezone}).</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Amenities" />
            <div className="px-5 pb-5 flex flex-wrap gap-1.5">{s.amenities.length ? s.amenities.map((a) => <Badge key={a}>{AMENITY_LABELS[a as Amenity] ?? a}</Badge>) : <span className="text-sm text-muted">None listed</span>}</div>
          </Card>
          <Card>
            <CardHeader title="Payment methods" />
            <div className="px-5 pb-5 flex flex-wrap gap-1.5">{s.paymentMethods.map((m) => <Badge key={m}><CreditCard className="size-3" />{PAYMENT_METHOD_LABELS[m as PaymentMethodKind] ?? m}</Badge>)}</div>
          </Card>
          <Card>
            <CardHeader title="About this information" />
            <div className="px-5 pb-5 text-[13px] space-y-2">
              <InfoRow k="Port status" v={<SourceBadge source={s.status.source} updatedAt={s.status.updatedAt} stale={s.status.stale} />} />
              <InfoRow k="Prices" v={s.pricing ? <span className="text-muted">Operator · {timeAgo(s.pricing.updatedAt)}</span> : '—'} />
              <InfoRow k="Listing details" v={<span className="text-muted">Updated {timeAgo(s.infoUpdatedAt)}</span>} />
              <InfoRow k="Wait & charge times" v={<SourceBadge source="estimated" />} />
              <InfoRow k="Data connection" v={<span className="text-muted">{s.integration.type === 'ocpp' ? 'OCPP (live)' : s.integration.type === 'ocpi' ? 'OCPI (live)' : s.integration.type === 'simulator' ? 'Demo simulator' : 'None (manual updates)'}</span>} />
            </div>
          </Card>
        </div>
      </div>

      <StartModal open={modal === 'start'} onClose={() => setModal(null)} station={s} initialPort={selectedPort} />
      <ReserveModal open={modal === 'reserve'} onClose={() => setModal(null)} station={s} initialPort={selectedPort} />
      <ReportModal open={modal === 'report'} onClose={() => setModal(null)} station={s} onDone={reload} />
    </div>
  );
}

function HeroFact({ icon: Icon, label, value, sub, est }: { icon: any; label: string; value: string; sub?: string; est?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted font-medium"><Icon className="size-3.5" />{label}{est && <EstimatedTag />}</div>
      <div className="text-lg font-semibold mt-1 tabular tracking-tight">{value}</div>
      {sub && <div className="text-[11.5px] text-muted leading-tight">{sub}</div>}
    </div>
  );
}
function PriceRow({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className="flex justify-between gap-3 py-1 border-b border-border/60"><span className="text-muted">{k}</span><span className={cn('font-medium tabular text-right', tone)}>{v}</span></div>;
}
function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-muted">{k}</span>{v}</div>;
}

function useMyVehicles() {
  const { data } = useFetch<{ vehicles: Vehicle[] }>('/me/vehicles');
  return data?.vehicles ?? null;
}

function StartModal({ open, onClose, station: s, initialPort }: { open: boolean; onClose: () => void; station: Station; initialPort: Port | null }) {
  const router = useRouter();
  const toast = useToast();
  const vehicles = useMyVehicles();
  const { data: pm } = useFetch<{ methods: any[] }>(open ? '/me/payment-methods' : null);
  const [vehicleId, setVehicleId] = useState('');
  const vehicle = vehicles?.find((v) => v.id === vehicleId) ?? null;
  const ports = useMemo(() => s.ports.filter((p) => !vehicle || vehicle.connectors.includes(p.connectorType)), [s.ports, vehicle]);
  const [portId, setPortId] = useState('');
  const [startSoc, setStartSoc] = useState(30);
  const [target, setTarget] = useState(80);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (vehicles?.length && !vehicleId) setVehicleId((vehicles.find((v) => v.is_default) ?? vehicles[0]).id); }, [vehicles]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (vehicle) { setStartSoc(vehicle.current_soc); setTarget(Math.max(vehicle.target_soc, vehicle.current_soc + 5)); } }, [vehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pick = (initialPort && ports.find((p) => p.id === initialPort.id && p.status === 'available')) ?? ports.filter((p) => p.status === 'available').sort((a, b) => b.maxPowerKw - a.maxPowerKw)[0];
    setPortId(pick?.id ?? '');
  }, [ports, initialPort]);
  useEffect(() => { if (pm?.methods.length && !method) setMethod((pm.methods.find((m) => m.is_default) ?? pm.methods[0]).id); }, [pm]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    setBusy(true);
    try {
      const r = await api.post('/sessions', { portId, vehicleId, startSoc, targetSoc: target, paymentMethodId: method || null });
      toast('success', 'Charging started');
      router.push(`/sessions/${r.session.id}`);
    } catch (e: any) {
      toast('error', 'Could not start charging', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Start charging at ${s.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={start} loading={busy} disabled={!portId || !vehicleId || target <= startSoc}><PlugZap className="size-4" /> Start session</Button></>}>
      {vehicles && vehicles.length === 0 ? (
        <div className="text-sm">Add your vehicle first so we can check compatibility. <Link href="/profile" className="text-accent font-medium">Add a vehicle →</Link></div>
      ) : (
        <div className="space-y-4">
          {s.integration.type === 'simulator' && <div className="rounded-xl bg-violet-soft text-violet text-[13px] p-3">Demo station: the session is simulated (sped up) and payment uses the demo provider — no money moves.</div>}
          <Field label="Vehicle"><Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>{vehicles?.map((v) => <option key={v.id} value={v.id}>{v.nickname ? `${v.nickname} — ` : ''}{v.brand} {v.model}</option>)}</Select></Field>
          <Field label="Port" hint={ports.length ? 'Plug in your car before starting.' : 'No compatible ports at this station.'}>
            <Select value={portId} onChange={(e) => setPortId(e.target.value)}>
              <option value="" disabled>Choose a port</option>
              {ports.map((p) => <option key={p.id} value={p.id} disabled={p.status !== 'available'}>{p.label} · {p.connectorType} {p.maxPowerKw} kW — {p.status.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="flex justify-between text-[13px] mb-2"><span>Battery now</span><b className="tabular">{startSoc}%</b></div><Slider value={startSoc} onChange={(v) => setStartSoc(Math.min(v, 98))} accent="var(--warning)" /></div>
            <div><div className="flex justify-between text-[13px] mb-2"><span>Stop at</span><b className="tabular">{target}%</b></div><Slider value={target} onChange={setTarget} /></div>
          </div>
          <Field label="Pay with">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {pm?.methods.length ? pm.methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>) : <option value="">No saved method — pay later</option>}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}

function ReserveModal({ open, onClose, station: s, initialPort }: { open: boolean; onClose: () => void; station: Station; initialPort: Port | null }) {
  const toast = useToast();
  const router = useRouter();
  const vehicles = useMyVehicles();
  const [vehicleId, setVehicleId] = useState('');
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const ports = s.ports.filter((p) => (!vehicle || vehicle.connectors.includes(p.connectorType)) && !['out_of_service', 'offline', 'no_power'].includes(p.status));
  const [portId, setPortId] = useState('');
  const defaultStart = () => { const d = new Date(Date.now() + 60 * 60_000); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
  const [start, setStart] = useState(defaultStart);
  const [duration, setDuration] = useState(45);
  const [busy, setBusy] = useState(false);
  const { data: slots } = useFetch<any>(open && portId ? `/stations/${s.id}/reservation-slots?portId=${portId}` : null, [portId]);
  useEffect(() => { if (vehicles?.length && !vehicleId) setVehicleId((vehicles.find((v) => v.is_default) ?? vehicles[0]).id); }, [vehicles]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPortId((initialPort && ports.find((p) => p.id === initialPort.id)?.id) ?? ports.sort((a, b) => b.maxPowerKw - a.maxPowerKw)[0]?.id ?? ''); }, [vehicleId, initialPort?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/reservations', { portId, vehicleId: vehicleId || undefined, startAt: new Date(start).toISOString(), durationMinutes: duration });
      toast('success', 'Reservation confirmed', 'We will remind you 15 minutes before.');
      onClose();
      router.push('/history?tab=reservations');
    } catch (e: any) {
      toast('error', 'Could not reserve', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Reserve a charging port"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!portId}>Confirm{s.reservationFee ? ` · ${formatMoney(s.reservationFee, s.pricing?.currency ?? 'PKR')}` : ''}</Button></>}>
      <div className="space-y-4">
        {vehicles && vehicles.length > 0 && <Field label="Vehicle"><Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model}</option>)}</Select></Field>}
        <Field label="Port"><Select value={portId} onChange={(e) => setPortId(e.target.value)}>{ports.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.connectorType} {p.maxPowerKw} kW</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Duration"><Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}</Select></Field>
        </div>
        {slots?.busy?.length > 0 && (
          <div className="text-[13px]"><div className="font-medium mb-1">Already booked on this port</div>
            <ul className="text-muted space-y-0.5">{slots.busy.map((b: any, i: number) => <li key={i}>{dateTime(b.start_at)} – {clockTime(b.end_at)}</li>)}</ul></div>
        )}
        <p className="text-xs text-muted">Your port is held from the start time with a 15-minute grace period. Reservation fee: {s.reservationFee ? formatMoney(s.reservationFee, s.pricing?.currency ?? 'PKR') : 'free'}.</p>
      </div>
    </Modal>
  );
}

function ReportModal({ open, onClose, station: s, onDone }: { open: boolean; onClose: () => void; station: Station; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState('status');
  const [portId, setPortId] = useState('');
  const [status, setStatus] = useState('out_of_service');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/stations/${s.id}/reports`, { kind, portId: portId || undefined, reportedStatus: kind === 'status' ? status : undefined, message });
      toast('success', 'Thanks for reporting', r.applied ? 'The port status was updated and marked as a driver report.' : 'The operator and our team have been notified.');
      onClose();
      onDone();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Report an issue" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Send report</Button></>}>
      <div className="space-y-4">
        <Field label="What's wrong?"><Select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="status">A charger&apos;s status is wrong</option><option value="wrong_info">Station details are wrong</option><option value="price">Price is wrong</option><option value="closed">Station is closed / removed</option><option value="other">Something else</option>
        </Select></Field>
        {kind === 'status' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port"><Select value={portId} onChange={(e) => setPortId(e.target.value)}><option value="">Whole station</option>{s.ports.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
            <Field label="Actual status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="available">Available</option><option value="occupied">Occupied</option><option value="out_of_service">Not working</option><option value="no_power">No electricity</option></Select></Field>
          </div>
        )}
        <Field label="Details (optional)"><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything that helps the operator fix it" /></Field>
      </div>
    </Modal>
  );
}
