'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BatteryCharging, Clock, Gauge, Info, PiggyBank, Thermometer, Zap } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CONNECTOR_LABELS, formatDuration, formatMoney, type ConnectorType } from "@wattly/shared";
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useFetch } from '@/lib/hooks';
import { clockTime, cn } from '@/lib/format';
import type { Station, Vehicle } from '@/lib/types';
import { Field, Input, Select, Skeleton, Slider } from '@/components/ui';
import { SourceBadge } from './badges';

export function Estimator({ station, initialPortId, onVehicleChange }: { station: Station; initialPortId?: string | null; onVehicleChange?: (v: Vehicle | null) => void }) {
  const { me } = useAuth();
  const { data: myVehicles } = useFetch<{ vehicles: Vehicle[] }>(me.user ? '/me/vehicles' : null);
  const { data: catalog } = useFetch<{ models: any[] }>('/vehicle-models');
  const vehicles = myVehicles?.vehicles ?? [];
  const [vehicleKey, setVehicleKey] = useState<string>('');
  useEffect(() => {
    if (vehicleKey) return;
    if (vehicles.length) setVehicleKey(`v:${vehicles.find((v) => v.is_default)?.id ?? vehicles[0].id}`);
    else if (catalog?.models.length) setVehicleKey(`m:${catalog.models[0].id}`);
  }, [vehicles, catalog, vehicleKey]);

  const vehicle = useMemo(() => {
    if (vehicleKey.startsWith('v:')) {
      const v = vehicles.find((x) => x.id === vehicleKey.slice(2));
      return v ? { kind: 'mine' as const, id: v.id, name: v.nickname || `${v.brand} ${v.model}`, connectors: v.connectors, batteryKwh: v.battery_kwh, maxAcKw: v.max_ac_kw, maxDcKw: v.max_dc_kw, curveProfile: v.curve_profile, soc: v.current_soc, target: v.target_soc, raw: v } : null;
    }
    const m = catalog?.models.find((x) => String(x.id) === vehicleKey.slice(2));
    return m ? { kind: 'model' as const, id: String(m.id), name: `${m.brand} ${m.model} ${m.variant}`, connectors: m.connectors, batteryKwh: m.battery_kwh, maxAcKw: m.max_ac_kw, maxDcKw: m.max_dc_kw, curveProfile: m.curve_profile, soc: 20, target: 80, raw: null } : null;
  }, [vehicleKey, vehicles, catalog]);

  useEffect(() => { onVehicleChange?.(vehicle?.raw ?? null); }, [vehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const compatiblePorts = station.ports.filter((p) => !vehicle || vehicle.connectors.includes(p.connectorType));
  const [portId, setPortId] = useState<string | null>(initialPortId ?? null);
  useEffect(() => {
    if (portId && compatiblePorts.some((p) => p.id === portId)) return;
    const best = [...compatiblePorts].sort((a, b) => (b.status === 'available' ? 1 : 0) - (a.status === 'available' ? 1 : 0) || b.maxPowerKw - a.maxPowerKw)[0];
    setPortId(best?.id ?? null);
  }, [vehicle?.id, station.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialPortId) setPortId(initialPortId); }, [initialPortId]);

  const [startSoc, setStartSoc] = useState(20);
  const [targetSoc, setTargetSoc] = useState(80);
  const [temp, setTemp] = useState<string>('');
  useEffect(() => { if (vehicle) { setStartSoc(vehicle.soc); setTargetSoc(Math.max(vehicle.target, vehicle.soc + 5)); } }, [vehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = useDebounced({ portId, startSoc, targetSoc, temp, vehicleKey }, 250);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!vehicle || !params.portId) return;
    if (params.targetSoc <= params.startSoc) return setError('Target must be higher than the current battery level.');
    setLoading(true);
    const body: any = { portId: params.portId, startSoc: params.startSoc, targetSoc: params.targetSoc, ambientTempC: params.temp === '' ? null : Number(params.temp) };
    if (vehicle.kind === 'mine') body.vehicleId = vehicle.id;
    else body.vehicle = { batteryKwh: vehicle.batteryKwh, maxAcKw: vehicle.maxAcKw, maxDcKw: vehicle.maxDcKw, curveProfile: vehicle.curveProfile };
    api.post('/estimate', body).then((r) => { setResult(r); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [params, vehicle?.kind, vehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const e = result?.estimate;
  const port = station.ports.find((p) => p.id === portId);
  const cur = station.pricing?.currency ?? 'PKR';

  if (!compatiblePorts.length && vehicle)
    return <p className="text-sm text-muted">No port here is compatible with {vehicle.name} ({vehicle.connectors.map((c: ConnectorType) => CONNECTOR_LABELS[c]).join(', ')}).</p>;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Vehicle">
          <Select value={vehicleKey} onChange={(e) => setVehicleKey(e.target.value)}>
            {vehicles.length > 0 && <optgroup label="My vehicles">{vehicles.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.nickname ? `${v.nickname} — ` : ''}{v.brand} {v.model}</option>)}</optgroup>}
            <optgroup label="Popular models">{catalog?.models.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.brand} {m.model} {m.variant}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Charging port">
          <Select value={portId ?? ''} onChange={(e) => setPortId(e.target.value)}>
            {compatiblePorts.map((p) => <option key={p.id} value={p.id}>{p.label} · {CONNECTOR_LABELS[p.connectorType]} {p.maxPowerKw} kW {p.currentType}{p.status !== 'available' ? ` (${p.status.replace(/_/g, ' ')})` : ''}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
        <div>
          <div className="flex justify-between text-[13px] mb-2"><span className="font-medium">Current battery</span><span className="tabular font-semibold">{startSoc}%</span></div>
          <Slider value={startSoc} onChange={(v) => setStartSoc(Math.min(v, 99))} accent="var(--warning)" />
        </div>
        <div>
          <div className="flex justify-between text-[13px] mb-2"><span className="font-medium">Charge to</span><span className="tabular font-semibold">{targetSoc}%</span></div>
          <Slider value={targetSoc} onChange={(v) => setTargetSoc(Math.max(v, 1))} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Thermometer className="size-4 text-muted" />
        <span className="text-[13px] text-muted">Outside temperature (optional)</span>
        <div className="ml-auto w-24"><Input type="number" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="°C" className="h-8" aria-label="Outside temperature in Celsius" /></div>
      </div>

      {error && <div className="text-sm text-danger flex gap-2"><AlertTriangle className="size-4 shrink-0 mt-0.5" />{error}</div>}
      {!e && loading && <Skeleton className="h-40" />}
      {e && (
        <div className={cn('space-y-4 transition-opacity', loading && 'opacity-60')}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-muted">Estimate for {vehicle?.name} on {port?.label}</span>
            <SourceBadge source="estimated" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric icon={Clock} label="Charging time" value={formatDuration(e.durationMinutes)} sub={`Done ~${clockTime(e.completionTime)}`} />
            <Metric icon={BatteryCharging} label="Energy" value={`${e.energyFromChargerKwh} kWh`} sub={`${e.energyToBatteryKwh} kWh into battery`} />
            <Metric icon={Zap} label="Avg power" value={`${e.averagePowerKw} kW`} sub={`Peak ${e.peakPowerKw} kW · ${e.limitingFactor === 'charger' ? 'charger-limited' : 'car-limited'}`} />
            <Metric icon={Gauge} label="Estimated cost" value={e.cost ? formatMoney(e.cost.total, e.cost.currency) : '—'} sub={e.cost ? `avg ${formatMoney(e.cost.averageRate, e.cost.currency)}/kWh` : 'No tariff'} />
          </div>
          <div className="h-36 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={e.curve}>
                <defs>
                  <linearGradient id="pw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--electric)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--electric)" stopOpacity={0} /></linearGradient>
                </defs>
                <XAxis dataKey="minute" type="number" domain={[0, 'dataMax']} tickFormatter={(m) => `${Math.round(m)}m`} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="powerKw" width={40} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} unit="" />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
                  formatter={(v: any) => [`${v} kW`, 'Power']} labelFormatter={(m: any) => { const pt = e.curve.find((c: any) => c.minute === m); return `${Math.round(m)} min · ${pt ? Math.round(pt.soc) : ''}%`; }} />
                <Area type="monotone" dataKey="powerKw" stroke="var(--electric)" strokeWidth={2} fill="url(#pw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {e.cost && (
            <div className="rounded-xl bg-surface-2 p-3 text-[13px] space-y-1 tabular">
              <Row k={`Energy (${e.cost.energyKwh} kWh)`} v={formatMoney(e.cost.energyCost, cur)} />
              {e.cost.serviceCharge > 0 && <Row k="Service charge" v={formatMoney(e.cost.serviceCharge, cur)} />}
              {e.cost.sessionFee > 0 && <Row k="Session fee" v={formatMoney(e.cost.sessionFee, cur)} />}
              {e.cost.timeFee > 0 && <Row k="Time fee" v={formatMoney(e.cost.timeFee, cur)} />}
              {e.cost.parkingFee > 0 && <Row k="Parking" v={formatMoney(e.cost.parkingFee, cur)} />}
              {e.cost.tax > 0 && <Row k="Tax" v={formatMoney(e.cost.tax, cur)} />}
              <div className="h-px bg-border my-1.5" />
              <Row k={<b>Estimated total</b>} v={<b>{formatMoney(e.cost.total, cur)}</b>} />
              {e.cost.notes.map((n: string) => <p key={n} className="text-xs text-muted pt-1">{n}</p>)}
            </div>
          )}
          {result?.windows && result.windows.savings > 0.5 && (
            <div className="rounded-xl border border-accent/40 bg-accent-soft/50 p-3 flex gap-3">
              <PiggyBank className="size-5 text-accent shrink-0 mt-0.5" />
              <div className="text-[13px]">
                <div className="font-semibold">Save {formatMoney(result.windows.savings, cur)} ({result.windows.savingsPercent}%) by starting at {clockTime(result.windows.best.start, station.timezone)}</div>
                <div className="text-muted mt-0.5">Start now: {formatMoney(result.windows.now.total, cur)} · Cheapest in next 24 h: {formatMoney(result.windows.best.total, cur)} (station time)</div>
              </div>
            </div>
          )}
          {result?.windows && result.windows.savings <= 0.5 && <p className="text-xs text-muted">Starting now is already the cheapest option in the next 24 hours.</p>}
          {e.warnings.length > 0 && (
            <ul className="space-y-1">{e.warnings.map((w: string) => <li key={w} className="text-[13px] text-warning flex gap-2"><AlertTriangle className="size-4 shrink-0 mt-0.5" />{w}</li>)}</ul>
          )}
          <details className="text-xs text-muted">
            <summary className="cursor-pointer inline-flex items-center gap-1"><Info className="size-3.5" /> How this is calculated</summary>
            <ul className="mt-2 space-y-1 list-disc pl-5">{e.assumptions.map((a: string) => <li key={a}>{a}</li>)}</ul>
          </details>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted font-medium"><Icon className="size-3.5" />{label}</div>
      <div className="text-[17px] font-semibold mt-1 tabular tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}
function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted">{k}</span><span>{v}</span></div>;
}
