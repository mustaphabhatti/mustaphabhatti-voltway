'use client';
import { useMemo, useState } from 'react';
import { CircleDollarSign, Copy, Plus, Trash2 } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DEFAULT_TARIFF, dailySchedule, formatMoney, normalizeTariff, type Tariff, type TouPeriod } from '@voltway/shared';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cn, timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, Chip, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonList, Toggle } from '@/components/ui';
import { tooltipStyle } from '@/components/charts';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KIND_COLOR: Record<string, string> = { peak: 'var(--danger)', off_peak: 'var(--accent)', super_off_peak: 'var(--accent)', shoulder: 'var(--warning)', weekend: 'var(--violet)', standard: 'var(--series-1)' };

export default function PricingPage() {
  const { data, error, loading, reload } = useFetch<{ tariffs: any[] }>('/operator/tariffs');
  const [editing, setEditing] = useState<{ id?: string; name: string; config: Tariff } | null>(null);
  const toast = useToast();
  return (
    <>
      <PageHeader title="Pricing" subtitle="Tariffs with peak / off-peak windows, weekend and seasonal rates, discounts and dynamic pricing. Assign a tariff to stations on the station page."
        actions={<Button onClick={() => setEditing({ name: 'New tariff', config: normalizeTariff({ ...DEFAULT_TARIFF }) })}><Plus className="size-4" />New tariff</Button>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data?.tariffs.length ? (
        <EmptyState icon={<CircleDollarSign className="size-6" />} title="No tariffs yet" body="Create a tariff, then assign it to your stations." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.tariffs.map((t) => {
            const c = normalizeTariff(t.config);
            return (
              <Card key={t.id} className="p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{t.name}</div><div className="text-xs text-muted">Used by {t.stations} station{t.stations === 1 ? '' : 's'} · updated {timeAgo(t.updated_at)}</div></div>
                  <Badge tone="blue">{c.currency}</Badge>
                </div>
                <div className="text-2xl font-semibold tabular mt-3">{formatMoney(c.baseRate, c.currency)}<span className="text-sm font-normal text-muted">/kWh standard</span></div>
                <MiniSchedule tariff={c} />
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {c.periods.map((p) => <Badge key={p.label} tone={p.kind === 'peak' ? 'red' : 'green'}>{p.label} {p.start}–{p.end}: {formatMoney(p.rate, c.currency)}</Badge>)}
                  {c.weekendRate != null && <Badge tone="violet">Weekend {formatMoney(c.weekendRate, c.currency)}</Badge>}
                  {c.seasonal.map((s) => <Badge key={s.label} tone="amber">{s.label} ×{s.multiplier}</Badge>)}
                  {c.discounts.map((d) => <Badge key={d.label} tone="green">{d.label} −{d.percent}%</Badge>)}
                  {c.dynamic.enabled && <Badge tone="violet">Dynamic ×{c.dynamic.minMultiplier}–{c.dynamic.maxMultiplier}</Badge>}
                  {c.sessionFee > 0 && <Badge>Session {formatMoney(c.sessionFee, c.currency)}</Badge>}
                  {c.idleFeePerMinute > 0 && <Badge>Idle {formatMoney(c.idleFeePerMinute, c.currency)}/min</Badge>}
                </div>
                <div className="flex gap-2 mt-auto pt-4">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ id: t.id, name: t.name, config: c })}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ name: `${t.name} (copy)`, config: c })}><Copy className="size-3.5" />Duplicate</Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={async () => { if (!confirm(`Delete ${t.name}?`)) return; try { await api.del(`/operator/tariffs/${t.id}`); reload(true); } catch (e: any) { toast('error', e.message); } }}><Trash2 className="size-4" /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <TariffEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(true); }} />}
    </>
  );
}

function MiniSchedule({ tariff, tz = 'UTC' }: { tariff: Tariff; tz?: string }) {
  const rows = useMemo(() => {
    const start = new Date(Date.UTC(2026, 0, 5, 0, 0)); // a Monday, schedule by hour-of-day
    return dailySchedule(tariff, start, tz, 24, 60).map((r, i) => ({ ...r, h: i }));
  }, [tariff, tz]);
  return (
    <div className="h-16 mt-3 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barCategoryGap={1}>
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} formatter={(v: any, _n, p: any) => [formatMoney(Number(v), tariff.currency), p.payload.periodLabel]} labelFormatter={(_l, p: any) => `${String(p?.[0]?.payload?.h ?? 0).padStart(2, '0')}:00 (weekday)`} />
          <Bar dataKey="rate" radius={[2, 2, 0, 0]}>{rows.map((r) => <Cell key={r.h} fill={KIND_COLOR[r.periodKind]} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TariffEditor({ initial, onClose, onSaved }: { initial: { id?: string; name: string; config: Tariff }; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(initial.name);
  const [c, setC] = useState<Tariff>(initial.config);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Tariff>(k: K, v: Tariff[K]) => setC({ ...c, [k]: v });
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const save = async () => {
    setBusy(true);
    try {
      if (initial.id) await api.patch(`/operator/tariffs/${initial.id}`, { name, config: c }); else await api.post('/operator/tariffs', { name, config: c });
      toast('success', 'Tariff saved', initial.id ? 'Drivers who saved affected stations are notified of price changes.' : undefined);
      onSaved();
    } catch (e: any) { toast('error', 'Could not save tariff', e.message); } finally { setBusy(false); }
  };
  const updatePeriod = (i: number, p: Partial<TouPeriod>) => set('periods', c.periods.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const sample = useMemo(() => {
    // 40 kWh session at different start hours (weekday) for the preview table
    return [8, 13, 19, 2].map((h) => {
      const at = new Date(Date.UTC(2026, 0, 5, h, 0));
      const s = dailySchedule(c, at, 'UTC', 1, 60)[0];
      const energy = 40 * s.rate;
      const total = (energy * (1 + c.serviceChargePercent / 100) + c.sessionFee) * (1 + c.taxPercent / 100);
      return { h, rate: s.rate, label: s.periodLabel, total };
    });
  }, [c]);
  return (
    <Modal open onClose={onClose} title={initial.id ? `Edit ${initial.name}` : 'New tariff'} wide footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save tariff</Button></>}>
      <div className="space-y-6">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Tariff name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Currency"><Select value={c.currency} onChange={(e) => set('currency', e.target.value)}>{['PKR', 'AED', 'SAR', 'USD', 'EUR', 'GBP', 'INR'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Standard rate / kWh"><Input type="number" step="0.01" min={0} value={c.baseRate} onChange={(e) => set('baseRate', num(e.target.value))} /></Field>
          <div className="sm:col-span-2 flex items-end gap-3">
            <Toggle checked={c.weekendRate != null} onChange={(v) => set('weekendRate', v ? c.baseRate : null)} label="Separate weekend rate" />
            {c.weekendRate != null && <>
              <Input type="number" step="0.01" className="w-28" value={c.weekendRate} onChange={(e) => set('weekendRate', num(e.target.value))} aria-label="Weekend rate" />
              <div className="flex gap-1">{DAYS.map((d, i) => <Chip key={d} className="!h-7 !px-2" active={(c.weekendDays ?? [0, 6]).includes(i)} onClick={() => { const w = c.weekendDays ?? [0, 6]; set('weekendDays', w.includes(i) ? w.filter((x) => x !== i) : [...w, i]); }}>{d[0]}</Chip>)}</div>
            </>}
          </div>
        </div>

        <section>
          <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Time-of-use periods</h3><Button size="sm" variant="outline" onClick={() => set('periods', [...c.periods, { label: c.periods.length ? 'Off-peak' : 'Peak', kind: c.periods.length ? 'off_peak' : 'peak', start: c.periods.length ? '23:00' : '17:00', end: c.periods.length ? '07:00' : '22:00', rate: c.baseRate, days: [] }])}><Plus className="size-3.5" />Add period</Button></div>
          <p className="text-xs text-muted mb-2">Times use each station&apos;s local time zone. A period can cross midnight. Periods override the standard and weekend rate; the first matching period wins.</p>
          <div className="space-y-2">
            {c.periods.map((p, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-3 grid grid-cols-2 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-2 items-end">
                <Field label="Label"><Input value={p.label} onChange={(e) => updatePeriod(i, { label: e.target.value })} /></Field>
                <Field label="Type"><Select value={p.kind} onChange={(e) => updatePeriod(i, { kind: e.target.value as TouPeriod['kind'] })}><option value="peak">Peak</option><option value="shoulder">Shoulder</option><option value="off_peak">Off-peak</option><option value="super_off_peak">Super off-peak</option></Select></Field>
                <Field label="From"><Input type="time" value={p.start} onChange={(e) => updatePeriod(i, { start: e.target.value })} /></Field>
                <Field label="To"><Input type="time" value={p.end} onChange={(e) => updatePeriod(i, { end: e.target.value })} /></Field>
                <Field label={`Rate (${c.currency})`}><Input type="number" step="0.01" value={p.rate} onChange={(e) => updatePeriod(i, { rate: num(e.target.value) })} /></Field>
                <Button size="icon" variant="ghost" onClick={() => set('periods', c.periods.filter((_, j) => j !== i))} aria-label="Remove period"><Trash2 className="size-4" /></Button>
                <div className="col-span-full flex items-center gap-1 flex-wrap"><span className="text-xs text-muted mr-1">Days:</span>{DAYS.map((d, di) => <Chip key={d} className="!h-7 !px-2" active={!p.days?.length || p.days.includes(di)} onClick={() => { const cur = p.days?.length ? p.days : [0, 1, 2, 3, 4, 5, 6]; const next = cur.includes(di) ? cur.filter((x) => x !== di) : [...cur, di]; updatePeriod(i, { days: next.length === 7 ? [] : next }); }}>{d}</Chip>)}</div>
              </div>
            ))}
            {!c.periods.length && <p className="text-sm text-muted">No time-based periods — the standard rate applies all day.</p>}
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Seasonal rates</h3><Button size="sm" variant="ghost" onClick={() => set('seasonal', [...c.seasonal, { label: 'Summer', startMonth: 5, endMonth: 9, multiplier: 1.1 }])}><Plus className="size-3.5" />Add</Button></div>
            {c.seasonal.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_70px_70px_auto] gap-2 items-end mb-2">
                <Field label="Label"><Input value={s.label} onChange={(e) => set('seasonal', c.seasonal.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></Field>
                <Field label="From mo."><Input type="number" min={1} max={12} value={s.startMonth} onChange={(e) => set('seasonal', c.seasonal.map((x, j) => (j === i ? { ...x, startMonth: num(e.target.value) } : x)))} /></Field>
                <Field label="To mo."><Input type="number" min={1} max={12} value={s.endMonth} onChange={(e) => set('seasonal', c.seasonal.map((x, j) => (j === i ? { ...x, endMonth: num(e.target.value) } : x)))} /></Field>
                <Field label="×"><Input type="number" step="0.01" value={s.multiplier} onChange={(e) => set('seasonal', c.seasonal.map((x, j) => (j === i ? { ...x, multiplier: num(e.target.value) } : x)))} /></Field>
                <Button size="icon" variant="ghost" onClick={() => set('seasonal', c.seasonal.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="size-4" /></Button>
              </div>
            ))}
            {!c.seasonal.length && <p className="text-xs text-muted">None</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Discounts & promotions</h3><Button size="sm" variant="ghost" onClick={() => set('discounts', [...c.discounts, { label: 'Launch offer', percent: 10 }])}><Plus className="size-3.5" />Add</Button></div>
            {c.discounts.map((d, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-2 mb-2 grid grid-cols-[1fr_70px_auto] gap-2 items-end">
                <Field label="Label"><Input value={d.label} onChange={(e) => set('discounts', c.discounts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></Field>
                <Field label="%"><Input type="number" min={0} max={90} value={d.percent} onChange={(e) => set('discounts', c.discounts.map((x, j) => (j === i ? { ...x, percent: num(e.target.value) } : x)))} /></Field>
                <Button size="icon" variant="ghost" onClick={() => set('discounts', c.discounts.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="size-4" /></Button>
                <Field label="Valid from"><Input type="date" value={d.validFrom ?? ''} onChange={(e) => set('discounts', c.discounts.map((x, j) => (j === i ? { ...x, validFrom: e.target.value || undefined } : x)))} /></Field>
                <Field label="Valid to"><Input type="date" value={d.validTo ?? ''} onChange={(e) => set('discounts', c.discounts.map((x, j) => (j === i ? { ...x, validTo: e.target.value || undefined } : x)))} /></Field>
              </div>
            ))}
            {!c.discounts.length && <p className="text-xs text-muted">None</p>}
          </div>
        </section>

        <section className="rounded-xl border border-border p-4 space-y-3">
          <Toggle checked={c.dynamic.enabled} onChange={(v) => set('dynamic', { ...c.dynamic, enabled: v })} label="Dynamic pricing" description="Scale the energy rate with how busy the station is: the minimum multiplier applies when empty, the maximum when every port is in use." />
          {c.dynamic.enabled && (
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <Field label="When empty ×"><Input type="number" step="0.01" min={0.5} max={1} value={c.dynamic.minMultiplier} onChange={(e) => set('dynamic', { ...c.dynamic, minMultiplier: num(e.target.value) })} /></Field>
              <Field label="When full ×"><Input type="number" step="0.01" min={1} max={3} value={c.dynamic.maxMultiplier} onChange={(e) => set('dynamic', { ...c.dynamic, maxMultiplier: num(e.target.value) })} /></Field>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2">Fees</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Session fee"><Input type="number" min={0} step="0.01" value={c.sessionFee} onChange={(e) => set('sessionFee', num(e.target.value))} /></Field>
            <Field label="Time fee / min"><Input type="number" min={0} step="0.01" value={c.timeFeePerMinute} onChange={(e) => set('timeFeePerMinute', num(e.target.value))} /></Field>
            <Field label="Parking / hour"><Input type="number" min={0} step="0.01" value={c.parkingFeePerHour} onChange={(e) => set('parkingFeePerHour', num(e.target.value))} /></Field>
            <Field label="Service charge %"><Input type="number" min={0} max={50} value={c.serviceChargePercent} onChange={(e) => set('serviceChargePercent', num(e.target.value))} /></Field>
            <Field label="Idle fee / min"><Input type="number" min={0} step="0.01" value={c.idleFeePerMinute} onChange={(e) => set('idleFeePerMinute', num(e.target.value))} /></Field>
            <Field label="Idle grace (min)"><Input type="number" min={0} max={120} value={c.idleGraceMinutes} onChange={(e) => set('idleGraceMinutes', num(e.target.value))} /></Field>
            <Field label="Tax %"><Input type="number" min={0} max={50} value={c.taxPercent} onChange={(e) => set('taxPercent', num(e.target.value))} /></Field>
          </div>
        </section>

        <section className="rounded-xl bg-surface-2 p-4">
          <h3 className="text-sm font-semibold">Preview</h3>
          <MiniSchedule tariff={c} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            {sample.map((s) => (
              <div key={s.h} className={cn('rounded-lg bg-surface p-2.5 text-[12.5px]')}>
                <div className="text-muted">40 kWh at {String(s.h).padStart(2, '0')}:00</div>
                <div className="font-semibold tabular">{formatMoney(s.total, c.currency)}</div>
                <div className="text-[11px] text-muted">{s.label} · {formatMoney(s.rate, c.currency)}/kWh</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-2">Weekday example excluding seasonal, dynamic and date-limited rules.</p>
        </section>
      </div>
    </Modal>
  );
}
