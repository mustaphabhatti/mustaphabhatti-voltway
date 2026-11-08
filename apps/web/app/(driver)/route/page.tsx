'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownUp, BatteryCharging, ChevronDown, Clock, ExternalLink, Flag, Info, LocateFixed, MapPin, Navigation, Route as RouteIcon, Timer, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDistance, formatDuration, formatMoney } from '@voltway/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGeolocation } from '@/lib/geo';
import { useFetch, useMediaQuery } from '@/lib/hooks';
import { clockTime, cn } from '@/lib/format';
import type { Vehicle } from '@/lib/types';
import { Map } from '@/components/map';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Slider, Spinner } from '@/components/ui';
import { SearchBox } from '@/components/station/SearchBox';
import { EstimatedTag, TrafficBadge } from '@/components/station/badges';

type Pt = { lat: number; lng: number; label: string };

export default function RoutePlannerPage() {
  const { me } = useAuth();
  const geo = useGeolocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { data: mine } = useFetch<{ vehicles: Vehicle[] }>(me.user ? '/me/vehicles' : null, [me.user?.id]);
  const { data: catalog } = useFetch<{ models: any[] }>('/vehicle-models');
  const [from, setFrom] = useState<Pt | null>(null);
  const [to, setTo] = useState<Pt | null>(null);
  const [vehicleKey, setVehicleKey] = useState('');
  const [startSoc, setStartSoc] = useState(70);
  const [reserve, setReserve] = useState(15);
  const [temp, setTemp] = useState('');
  const [departAt, setDepartAt] = useState('');
  const [result, setResult] = useState<any>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    if (!from && geo.position && !geo.isFallback) setFrom({ ...geo.position, label: 'My location' });
  }, [geo.position, geo.isFallback]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (vehicleKey) return;
    const v = mine?.vehicles.find((x) => x.is_default) ?? mine?.vehicles[0];
    if (v) { setVehicleKey(`v:${v.id}`); setStartSoc(v.current_soc); }
    else if (catalog?.models.length && !me.user) setVehicleKey(`m:${catalog.models[0].id}`);
  }, [mine, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (me.preferences?.min_arrival_soc != null) setReserve(me.preferences.min_arrival_soc); }, [me.preferences?.min_arrival_soc]);

  const plan = async () => {
    if (!from || !to) return setError('Choose a start and a destination.');
    setLoading(true);
    setError(null);
    try {
      const body: any = { from, to, startSoc, minArrivalSoc: reserve, ambientTempC: temp === '' ? null : Number(temp) };
      if (departAt) body.departAt = new Date(departAt).toISOString();
      if (vehicleKey.startsWith('v:')) body.vehicleId = vehicleKey.slice(2);
      else {
        const m = catalog?.models.find((x) => `m:${x.id}` === vehicleKey);
        if (!m) throw new Error('Choose a vehicle');
        body.vehicle = { batteryKwh: m.battery_kwh, maxAcKw: m.max_ac_kw, maxDcKw: m.max_dc_kw, efficiencyWhPerKm: m.efficiency_wh_km, connectors: m.connectors, curveProfile: m.curve_profile };
      }
      const r = await api.post('/routes/plan', body);
      setResult(r);
      setActive(0);
      if (!isDesktop) setShowForm(false);
    } catch (e: any) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const opt = result?.options?.[active];
  const mapRoutes = useMemo(() => {
    if (!result) return [];
    const seen = new Set<number>();
    return result.options
      .filter((o: any) => (seen.has(o.routeIndex) ? false : (seen.add(o.routeIndex), true)))
      .map((o: any) => ({ id: `r${o.routeIndex}`, geometry: o.route.geometry, active: o.routeIndex === opt?.routeIndex, approximate: o.route.approximate }));
  }, [result, opt?.routeIndex]);
  const stops = opt?.plan.stops.map((s: any, i: number) => ({ id: s.candidate.stationId, lat: s.candidate.lat, lng: s.candidate.lng, label: String(i + 1), title: `${s.candidate.name} · ${s.chargeMinutes} min` })) ?? [];
  const fitPoints = opt ? opt.route.geometry : from && to ? [from, to] : [];

  const googleUrl = opt && from && to
    ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving${opt.plan.stops.length ? `&waypoints=${opt.plan.stops.map((s: any) => `${s.candidate.lat},${s.candidate.lng}`).join('|')}` : ''}`
    : null;

  const socChart = useMemo(() => {
    if (!opt || !result) return [];
    const pts: { km: number; soc: number; label?: string }[] = [{ km: 0, soc: result.startSoc, label: 'Start' }];
    let km = 0;
    for (const s of opt.plan.stops) {
      km += s.driveKmFromPrevious;
      pts.push({ km: Math.round(km), soc: s.arrivalSoc, label: s.candidate.name });
      pts.push({ km: Math.round(km), soc: s.departureSoc, label: `${s.candidate.name} (after charging)` });
    }
    pts.push({ km: Math.round(opt.route.distanceKm), soc: opt.plan.arrivalSoc, label: 'Arrival' });
    return pts;
  }, [opt, result]);

  const form = (
    <div className="p-4 space-y-4">
      <div className="relative space-y-2">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full border-[3px] border-electric shrink-0" />
          <SearchBox className="flex-1" placeholder="Start (city, address, station)" initial={from?.label ?? ''} near={geo.position} onPick={(r) => setFrom({ lat: r.lat, lng: r.lng, label: r.name })} />
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-text shrink-0" />
          <SearchBox className="flex-1" placeholder="Destination" initial={to?.label ?? ''} near={geo.position} onPick={(r) => setTo({ lat: r.lat, lng: r.lng, label: r.name })} />
        </div>
        <div className="flex gap-2 pl-5">
          <Button variant="ghost" size="sm" onClick={() => { if (geo.position && !geo.isFallback) setFrom({ ...geo.position, label: 'My location' }); else geo.request(); }}><LocateFixed className="size-3.5" />My location</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(to); setTo(from); }}><ArrowDownUp className="size-3.5" />Swap</Button>
        </div>
        {!to && (
          <div className="pl-5 flex flex-wrap gap-1.5">
            {[['Lahore → Islamabad', { lat: 31.5204, lng: 74.3587, label: 'Lahore' }, { lat: 33.6844, lng: 73.0479, label: 'Islamabad' }], ['Karachi → Hyderabad', { lat: 24.8607, lng: 67.0011, label: 'Karachi' }, { lat: 25.396, lng: 68.3578, label: 'Hyderabad' }], ['Dubai → Abu Dhabi', { lat: 25.2048, lng: 55.2708, label: 'Dubai' }, { lat: 24.4539, lng: 54.3773, label: 'Abu Dhabi' }]].map(([l, a, b]: any) => (
              <button key={l} onClick={() => { setFrom(a); setTo(b); }} className="text-xs rounded-full border border-border px-2.5 py-1 text-muted hover:text-text hover:bg-surface-2">{l}</button>
            ))}
          </div>
        )}
      </div>
      <Field label="Vehicle">
        <Select value={vehicleKey} onChange={(e) => { setVehicleKey(e.target.value); const v = mine?.vehicles.find((x) => `v:${x.id}` === e.target.value); if (v) setStartSoc(v.current_soc); }}>
          <option value="" disabled>Choose a vehicle</option>
          {mine?.vehicles.length ? <optgroup label="My vehicles">{mine.vehicles.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.nickname ? `${v.nickname} — ` : ''}{v.brand} {v.model}</option>)}</optgroup> : null}
          <optgroup label="Popular models">{catalog?.models.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.brand} {m.model} {m.variant}</option>)}</optgroup>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <div><div className="flex justify-between text-[13px] mb-2"><span className="font-medium">Battery now</span><b className="tabular">{startSoc}%</b></div><Slider value={startSoc} onChange={(v) => setStartSoc(Math.max(v, 1))} accent="var(--warning)" /></div>
        <div><div className="flex justify-between text-[13px] mb-2"><span className="font-medium">Arrive with at least</span><b className="tabular">{reserve}%</b></div><Slider value={reserve} min={5} max={40} onChange={setReserve} accent="var(--electric)" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Depart"><Input type="datetime-local" value={departAt} onChange={(e) => setDepartAt(e.target.value)} placeholder="Now" /></Field>
        <Field label="Outside temp (°C)"><Input type="number" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="Optional" /></Field>
      </div>
      {error && <p className="text-sm text-danger flex gap-2" role="alert"><AlertTriangle className="size-4 mt-0.5 shrink-0" />{error}</p>}
      <Button size="lg" className="w-full" onClick={plan} loading={loading} disabled={!from || !to || !vehicleKey}><RouteIcon className="size-4" /> Plan EV route</Button>
      {!me.user && <p className="text-xs text-muted text-center"><Link href="/login?next=/route" className="text-accent font-medium">Sign in</Link> to use your own vehicle and battery level.</p>}
    </div>
  );

  const results = result && (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm"><b>{result.from.label}</b> → <b>{result.to.label}</b></div>
        {!isDesktop && <Button size="sm" variant="ghost" onClick={() => setShowForm(true)}>Edit</Button>}
      </div>
      {result.approximate && (
        <div className="rounded-xl bg-warning-soft text-[12.5px] p-3 flex gap-2"><Info className="size-4 text-warning shrink-0 mt-0.5" /><span>No online routing service is reachable, so routes come from Voltway&apos;s offline highway graph. Distances and times are approximate; use the navigation hand-off for turn-by-turn guidance.</span></div>
      )}
      <div className="space-y-2">
        {result.options.map((o: any, i: number) => (
          <button key={o.id} onClick={() => setActive(i)} className={cn('w-full text-left rounded-2xl border p-3.5 transition', i === active ? 'border-electric ring-4 ring-electric/15 bg-surface' : 'border-border bg-surface hover:bg-surface-2')}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm">{o.label}</span>
              <span className="text-[15px] font-semibold tabular">{formatDuration(o.plan.totalMinutes)}</span>
            </div>
            <div className="text-xs text-muted mt-0.5 truncate">{o.route.summary}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[12.5px] text-muted">
              <span>{formatDistance(o.route.distanceKm)}</span>
              <span className="inline-flex items-center gap-1"><Zap className="size-3" />{o.plan.stops.length} stop{o.plan.stops.length === 1 ? '' : 's'} · {formatDuration(o.plan.chargeMinutes)} charging</span>
              <span className="inline-flex items-center gap-1"><BatteryCharging className="size-3" />Arrive {Math.round(o.plan.arrivalSoc)}%</span>
              {Object.entries(o.plan.totalChargingCost).map(([c, v]) => <span key={c}>{formatMoney(v as number, c)}</span>)}
            </div>
            {!o.plan.feasible && <Badge tone="red" className="mt-2">Not feasible with known chargers</Badge>}
          </button>
        ))}
      </div>

      {opt && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Kpi icon={Clock} label="Total trip" value={formatDuration(opt.plan.totalMinutes)} sub={`Arrive ~${clockTime(opt.plan.arriveAt)}`} />
            <Kpi icon={Timer} label="Driving" value={formatDuration(opt.plan.driveMinutes)} sub={<TrafficBadge level={opt.route.traffic.level} source={opt.route.traffic.source} />} />
            <Kpi icon={Zap} label="Charging" value={formatDuration(opt.plan.chargeMinutes + opt.plan.waitMinutes)} sub={opt.plan.waitMinutes ? `incl. ~${opt.plan.waitMinutes} min wait` : `${opt.plan.energyUsedKwh} kWh used`} />
          </div>
          {opt.plan.warnings.map((w: string) => <div key={w} className="rounded-xl bg-danger-soft text-danger text-[13px] p-3 flex gap-2"><AlertTriangle className="size-4 shrink-0 mt-0.5" />{w}</div>)}

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Battery along the trip</h3><EstimatedTag /></div>
            <div className="h-36 -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={socChart}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="km" type="number" domain={[0, 'dataMax']} tickFormatter={(k) => `${k} km`} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} width={36} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={reserve} stroke="var(--danger)" strokeDasharray="4 4" />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} formatter={(v: any) => [`${Math.round(v)}%`, 'Battery']} labelFormatter={(k: any, p: any) => `${p?.[0]?.payload?.label ?? ''} · ${k} km`} />
                  <Line type="linear" dataKey="soc" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <ol className="relative">
            <TimelineItem icon={<span className="size-3 rounded-full border-[3px] border-electric bg-surface" />} title={result.from.label} meta={`Depart ${clockTime(new Date(new Date(opt.plan.arriveAt).getTime() - opt.plan.totalMinutes * 60_000))} · ${result.startSoc}% battery`} />
            {opt.plan.stops.map((s: any, i: number) => (
              <TimelineItem key={s.candidate.stationId} icon={<span className="size-6 rounded-full bg-accent text-white text-[11px] font-bold grid place-items-center">{i + 1}</span>}
                title={<Link href={`/stations/${s.candidate.stationId}`} className="hover:underline">{s.candidate.name}</Link>}
                meta={`${formatDistance(s.driveKmFromPrevious)} from previous · arrive ${clockTime(s.arriveAt)}${s.candidate.detourKm > 1 ? ` · ${s.candidate.detourKm.toFixed(1)} km off route` : ''}`}>
                <div className="mt-2 rounded-xl bg-surface-2 p-3 grid grid-cols-2 gap-2 text-[12.5px]">
                  <div><span className="text-muted">Arrive with</span> <b className={cn('tabular', s.arrivalSoc < reserve + 2 && 'text-warning')}>{Math.round(s.arrivalSoc)}%</b></div>
                  <div><span className="text-muted">Charge to</span> <b className="tabular">{Math.round(s.departureSoc)}%</b></div>
                  <div><span className="text-muted">Charging</span> <b className="tabular">{formatDuration(s.chargeMinutes)}</b>{s.waitMinutes ? <span className="text-muted"> +{s.waitMinutes}m wait</span> : ''}</div>
                  <div><span className="text-muted">Charger</span> <b>{s.candidate.powerKw} kW {s.candidate.currentType}</b></div>
                  <div><span className="text-muted">Energy</span> <b className="tabular">{s.energyKwh} kWh</b></div>
                  <div><span className="text-muted">Cost</span> <b className="tabular">{s.cost != null ? formatMoney(s.cost, s.currency) : '—'}</b></div>
                  <div className="col-span-2 text-muted">{s.candidate.availablePorts}/{s.candidate.totalPorts} ports free now · leave ~{clockTime(s.departAt)}</div>
                </div>
              </TimelineItem>
            ))}
            <TimelineItem icon={<Flag className="size-4 text-text" />} title={result.to.label} meta={`Arrive ~${clockTime(opt.plan.arriveAt)} · ${Math.round(opt.plan.arrivalSoc)}% battery`} last />
          </ol>

          {opt.plan.notes.map((n: string) => <p key={n} className="text-xs text-muted flex gap-1.5"><Info className="size-3.5 shrink-0 mt-0.5" />{n}</p>)}
          <p className="text-xs text-muted">{opt.candidatesOnRoute} compatible station{opt.candidatesOnRoute === 1 ? '' : 's'} considered along this route.</p>

          {googleUrl && <a href={googleUrl} target="_blank" rel="noreferrer"><Button variant="electric" className="w-full"><Navigation className="size-4" /> Start navigation in Google Maps <ExternalLink className="size-3.5" /></Button></a>}
          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium flex items-center justify-between">Directions ({opt.route.steps.length} steps) <ChevronDown className="size-4" /></summary>
            <ol className="px-4 pb-3 space-y-2 text-[13px]">
              {opt.route.steps.slice(0, 80).map((st: any, i: number) => (
                <li key={i} className="flex justify-between gap-3 border-t border-border pt-2"><span>{st.instruction}</span><span className="text-muted whitespace-nowrap tabular">{formatDistance(st.distanceKm)}</span></li>
              ))}
            </ol>
          </details>
        </>
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 flex flex-col lg:flex-row">
      <aside className={cn('lg:w-[440px] shrink-0 lg:border-r border-border bg-bg overflow-y-auto scrollbar-thin z-[500]', isDesktop ? '' : showForm || !result ? 'max-h-[60%] border-b' : 'order-2 h-[55%] border-t')}>
        <div className="px-4 pt-4"><h1 className="text-lg font-semibold tracking-tight">EV route planner</h1><p className="text-xs text-muted">Charging stops, arrival battery and trip time for your car.</p></div>
        {(isDesktop || showForm || !result) && form}
        {loading && <div className="flex items-center gap-2 justify-center py-6 text-sm text-muted"><Spinner /> Planning your route…</div>}
        {!loading && results}
        {!loading && !result && <EmptyState icon={<MapPin className="size-6" />} title="Where are you going?" body="Pick a start and destination. We'll find compatible chargers along the way and estimate your battery at every stop." className="py-8" />}
      </aside>
      <div className="relative flex-1 min-h-[40%]">
        <Map center={from ?? geo.position ?? { lat: 31.5204, lng: 74.3587 }} zoom={7} routes={mapRoutes} stops={stops} user={geo.position && !geo.isFallback ? geo.position : null}
          endpoints={[from, to].filter(Boolean).map((p) => ({ ...p!, label: p!.label }))}
          fit={fitPoints.length > 1 ? { points: fitPoints, key: `${active}:${result?.options?.length ?? 0}:${from?.lat}:${to?.lat}` } : null} />
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface border border-border p-2.5">
      <div className="text-[11px] text-muted font-medium flex items-center gap-1"><Icon className="size-3" />{label}</div>
      <div className="text-[15px] font-semibold tabular mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function TimelineItem({ icon, title, meta, children, last }: { icon: React.ReactNode; title: React.ReactNode; meta?: string; children?: React.ReactNode; last?: boolean }) {
  return (
    <li className="relative pl-9 pb-5">
      {!last && <span className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-border" />}
      <span className="absolute left-0 top-0 size-6 grid place-items-center">{icon}</span>
      <div className="text-sm font-semibold">{title}</div>
      {meta && <div className="text-xs text-muted mt-0.5">{meta}</div>}
      {children}
    </li>
  );
}
