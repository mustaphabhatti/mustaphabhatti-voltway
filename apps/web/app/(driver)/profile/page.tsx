'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BatteryMedium, Building2, Car, CreditCard, Home, LifeBuoy, MapPin, Plus, Settings2, Star, Trash2, User, Wallet } from 'lucide-react';
import { CONNECTOR_LABELS, CONNECTOR_TYPES, CURVE_PROFILES, type ConnectorType, type CurveProfile } from '@voltway/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cn, timeAgo } from '@/lib/format';
import type { Vehicle } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Chip, EmptyState, Field, Input, Modal, PageHeader, Select, Slider, Textarea } from '@/components/ui';
import { RequireRole } from '@/components/layout/RequireRole';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { SearchBox } from '@/components/station/SearchBox';

function Profile() {
  const params = useSearchParams();
  const { me, refresh } = useAuth();
  const toast = useToast();
  const vehicles = useFetch<{ vehicles: Vehicle[] }>('/me/vehicles');
  const methods = useFetch<{ methods: any[] }>('/me/payment-methods');
  const places = useFetch<{ places: any[] }>('/me/places');
  const tickets = useFetch<{ complaints: any[] }>('/me/complaints');
  const { data: meta } = useFetch<any>('/stations/meta');
  const [vehicleModal, setVehicleModal] = useState<Vehicle | 'new' | null>(params.get('welcome') ? 'new' : null);
  const [pmModal, setPmModal] = useState(false);
  const [ticketModal, setTicketModal] = useState(false);
  const [name, setName] = useState(me.user?.fullName ?? '');
  const [phone, setPhone] = useState(me.user?.phone ?? '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const prefs = me.preferences ?? {};
  useEffect(() => { setName(me.user?.fullName ?? ''); setPhone(me.user?.phone ?? ''); }, [me.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePrefs = async (patch: any) => {
    try { await api.patch('/me/preferences', patch); await refresh(); toast('success', 'Preferences saved'); } catch (e: any) { toast('error', e.message); }
  };
  const updateVehicle = async (v: Vehicle, patch: any) => {
    try { await api.patch(`/me/vehicles/${v.id}`, patch); vehicles.reload(true); refresh(); } catch (e: any) { toast('error', e.message); }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      <PageHeader title="Profile" subtitle="Your vehicles, preferences and payment methods." />
      {params.get('welcome') && <div className="rounded-2xl bg-accent-soft p-4 text-sm"><b>Welcome to Voltway!</b> Add your car so we can show compatible chargers and accurate charging times.</div>}

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Car className="size-4" />My vehicles</span>} subtitle="Battery capacity, charging limits and connectors drive every estimate." action={<Button size="sm" onClick={() => setVehicleModal('new')}><Plus className="size-4" /> Add vehicle</Button>} />
        <div className="px-5 pb-5">
          {!vehicles.data?.vehicles.length ? <EmptyState icon={<Car className="size-6" />} title="No vehicles yet" body="Add your EV to see compatible chargers." className="py-6" /> : (
            <div className="grid md:grid-cols-2 gap-3">
              {vehicles.data.vehicles.map((v) => (
                <div key={v.id} className={cn('rounded-2xl border p-4', v.is_default ? 'border-accent/50' : 'border-border')}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{v.brand} {v.model}</div>
                      <div className="text-xs text-muted">{v.nickname || 'No nickname'}{v.is_default && <Badge tone="green" className="ml-2">Default</Badge>}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setVehicleModal(v)}>Edit</Button>
                      {!v.is_default && <Button size="sm" variant="ghost" onClick={() => updateVehicle(v, { isDefault: true })}><Star className="size-3.5" /></Button>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-[12.5px]">
                    <Spec k="Battery" v={`${v.battery_kwh} kWh`} /><Spec k="AC max" v={`${v.max_ac_kw} kW`} /><Spec k="DC max" v={v.max_dc_kw ? `${v.max_dc_kw} kW` : '—'} />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">{v.connectors.map((c) => <Badge key={c}>{CONNECTOR_LABELS[c]}</Badge>)}<Badge tone="outline">{v.efficiency_wh_km} Wh/km</Badge></div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <SocControl label="Battery now" value={v.current_soc} onCommit={(x) => updateVehicle(v, { currentSoc: x })} accent="var(--warning)" />
                    <SocControl label="Charge target" value={v.target_soc} onCommit={(x) => updateVehicle(v, { targetSoc: x })} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Settings2 className="size-4" />Charging preferences</span>} />
          <div className="px-5 pb-5 space-y-4">
            <div>
              <div className="flex justify-between text-[13px] mb-2"><span className="font-medium">Minimum arrival battery (route planning)</span><b className="tabular">{prefs.min_arrival_soc ?? 15}%</b></div>
              <SocControl label="" value={prefs.min_arrival_soc ?? 15} max={40} onCommit={(x) => savePrefs({ minArrivalSoc: x })} accent="var(--electric)" hideLabel />
            </div>
            <Field label="Home city"><Select value={prefs.home_city ?? ''} onChange={(e) => savePrefs({ homeCity: e.target.value || null })}><option value="">Not set</option>{meta?.cities?.map((c: any) => <option key={c.city} value={c.city}>{c.city}</option>)}</Select></Field>
            <div>
              <div className="text-[13px] font-medium mb-2">Preferred networks</div>
              <div className="flex flex-wrap gap-2">{meta?.networks?.map((n: any) => {
                const on = (prefs.preferred_networks ?? []).includes(n.slug);
                return <Chip key={n.slug} active={on} onClick={() => savePrefs({ preferredNetworks: on ? prefs.preferred_networks.filter((x: string) => x !== n.slug) : [...(prefs.preferred_networks ?? []), n.slug] })}>{n.name}</Chip>;
              })}</div>
            </div>
            <Link href="/notifications" className="text-sm text-accent font-medium">Notification preferences →</Link>
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><User className="size-4" />Account</span>} subtitle={me.user?.email ?? me.user?.phone ?? ''} />
          <div className="px-5 pb-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92…" /></Field>
            </div>
            <Button size="sm" variant="secondary" onClick={async () => { try { await api.patch('/auth/me', { fullName: name, ...(phone ? { phone } : {}) }); await refresh(); toast('success', 'Profile updated'); } catch (e: any) { toast('error', e.message); } }}>Save</Button>
            <div className="h-px bg-border" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
              <Field label="New password"><Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            </div>
            <Button size="sm" variant="secondary" disabled={pw.newPassword.length < 8} onClick={async () => { try { await api.post('/auth/change-password', pw); setPw({ currentPassword: '', newPassword: '' }); toast('success', 'Password changed'); } catch (e: any) { toast('error', e.message); } }}>Change password</Button>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between"><span className="text-sm">Appearance</span><ThemeToggle /></div>
            {me.user?.role === 'driver' && <Link href="/operator/register" className="flex items-center gap-2 text-sm text-muted hover:text-text"><Building2 className="size-4" />Run charging stations? Register your company</Link>}
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><CreditCard className="size-4" />Payment methods</span>} action={<Button size="sm" variant="outline" onClick={() => setPmModal(true)}><Plus className="size-4" />Add</Button>} />
          <div className="px-5 pb-5 space-y-2">
            {!methods.data?.methods.length && <p className="text-sm text-muted">No payment methods saved.</p>}
            {methods.data?.methods.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="size-9 rounded-lg bg-surface-2 grid place-items-center">{m.type === 'card' ? <CreditCard className="size-4" /> : <Wallet className="size-4" />}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{m.label}</div><div className="text-xs text-muted">{m.type.replace('_', ' ')} · {m.provider}</div></div>
                {m.is_default && <Badge tone="green">Default</Badge>}
                <button aria-label="Remove" className="text-subtle hover:text-danger" onClick={async () => { await api.del(`/me/payment-methods/${m.id}`); methods.reload(true); }}><Trash2 className="size-4" /></button>
              </div>
            ))}
            <p className="text-xs text-muted">Card details are tokenised by the payment provider; Voltway never stores card numbers.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><MapPin className="size-4" />Saved places</span>} subtitle="Quick starts and destinations for route planning" />
          <div className="px-5 pb-5 space-y-2">
            <SearchBox placeholder="Add a place (home, office…)" onPick={async (r) => { const label = prompt('Name this place', r.name) ?? r.name; await api.post('/me/places', { label, address: r.address || r.name, lat: r.lat, lng: r.lng }); places.reload(true); }} />
            {places.data?.places.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <Home className="size-4 text-muted" />
                <div className="flex-1 min-w-0"><div className="text-sm font-medium">{p.label}</div><div className="text-xs text-muted truncate">{p.address}</div></div>
                <button aria-label="Remove" className="text-subtle hover:text-danger" onClick={async () => { await api.del(`/me/places/${p.id}`); places.reload(true); }}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Contributions />

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><LifeBuoy className="size-4" />Support</span>} subtitle="Billing problems, faulty chargers or app issues" action={<Button size="sm" variant="outline" onClick={() => setTicketModal(true)}>New ticket</Button>} />
        <div className="px-5 pb-5 space-y-2">
          {!tickets.data?.complaints.length && <p className="text-sm text-muted">No support tickets.</p>}
          {tickets.data?.complaints.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
              <div className="flex-1 min-w-0"><div className="font-medium truncate">{c.subject}</div><div className="text-xs text-muted">{c.station_name ?? 'General'} · {timeAgo(c.created_at)}</div></div>
              <Badge tone={c.status === 'resolved' || c.status === 'closed' ? 'green' : c.status === 'in_progress' ? 'blue' : 'amber'}>{c.status.replace('_', ' ')}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <VehicleModal value={vehicleModal} onClose={() => setVehicleModal(null)} onSaved={() => { vehicles.reload(true); refresh(); }} />
      <PaymentModal open={pmModal} onClose={() => setPmModal(false)} onSaved={() => methods.reload(true)} />
      <TicketModal open={ticketModal} onClose={() => setTicketModal(false)} onSaved={() => tickets.reload(true)} />
    </div>
  );
}

function Contributions() {
  const { data } = useFetch<any>('/me/contributions');
  if (!data) return null;
  return (
    <Card id="contributions">
      <CardHeader title={<span className="flex items-center gap-2"><Star className="size-4" />Community contributions</span>} subtitle="Check-ins, photos and stations you've added help every driver." action={<Link href="/add-station"><Button size="sm" variant="outline"><Plus className="size-4" />Add a station</Button></Link>} />
      <div className="px-5 pb-5 space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
          {[['checkins', 'Check-ins'], ['cities', 'Cities'], ['photos', 'Photos'], ['stations', 'Stations added'], ['reviews', 'Reviews']].map(([k, l]) => (
            <div key={k} className="rounded-xl bg-surface-2 p-2.5"><div className="text-xl font-semibold tabular">{data.stats[k]}</div><div className="text-[11px] text-muted">{l}</div></div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">{data.badges.map((b: any) => <Badge key={b.id} tone={b.earned ? 'green' : 'outline'} className={b.earned ? '' : 'opacity-60'}>{b.earned ? '★ ' : ''}{b.label}</Badge>)}</div>
        {data.stations.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold mb-2">Stations you added</div>
            <ul className="space-y-1.5">{data.stations.map((s: any) => <li key={s.id} className="flex items-center justify-between text-sm rounded-xl border border-border px-3 py-2"><Link href={`/stations/${s.id}`} className="font-medium hover:underline">{s.name}</Link><span className="flex gap-1.5">{s.coming_soon && <Badge>coming soon</Badge>}<Badge tone={s.listing_status === 'approved' ? 'green' : s.listing_status === 'rejected' ? 'red' : 'amber'}>{s.listing_status === 'approved' ? 'live' : s.listing_status === 'pending' ? 'in review' : s.listing_status}</Badge></span></li>)}</ul>
          </div>
        )}
        {data.checkins.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold mb-2">Your recent check-ins</div>
            <ul className="space-y-1 text-sm">{data.checkins.slice(0, 6).map((c: any) => <li key={c.id} className="flex justify-between gap-2"><Link href={`/stations/${c.station_id}`} className="truncate hover:underline">{c.station_name}</Link><span className="text-muted whitespace-nowrap">{c.outcome.replace(/_/g, ' ')} · {timeAgo(c.created_at)}</span></li>)}</ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg bg-surface-2 px-2 py-1.5"><div className="text-[10.5px] text-muted">{k}</div><div className="font-semibold tabular">{v}</div></div>;
}

function SocControl({ label, value, onCommit, max = 100, accent, hideLabel }: { label: string; value: number; onCommit: (v: number) => void; max?: number; accent?: string; hideLabel?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onCommit(v), 600);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      {!hideLabel && <div className="flex justify-between text-[12px] mb-1.5"><span className="text-muted inline-flex items-center gap-1"><BatteryMedium className="size-3.5" />{label}</span><b className="tabular">{v}%</b></div>}
      <Slider value={v} max={max} onChange={setV} accent={accent} />
    </div>
  );
}

function VehicleModal({ value, onClose, onSaved }: { value: Vehicle | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: catalog } = useFetch<{ models: any[] }>('/vehicle-models');
  const editing = value && value !== 'new' ? value : null;
  const blank = { modelId: null as number | null, nickname: '', brand: '', model: '', batteryKwh: 60, maxAcKw: 7.4, maxDcKw: 100, connectors: ['CCS2', 'Type2'] as ConnectorType[], curveProfile: 'standard_400v' as CurveProfile, efficiencyWhPerKm: 170, currentSoc: 50, targetSoc: 80, isDefault: false };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (editing) setF({ modelId: editing.model_id, nickname: editing.nickname, brand: editing.brand, model: editing.model, batteryKwh: Number(editing.battery_kwh), maxAcKw: Number(editing.max_ac_kw), maxDcKw: Number(editing.max_dc_kw), connectors: editing.connectors, curveProfile: editing.curve_profile as CurveProfile, efficiencyWhPerKm: editing.efficiency_wh_km, currentSoc: editing.current_soc, targetSoc: editing.target_soc, isDefault: editing.is_default });
    else if (value === 'new') setF(blank);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromCatalog = (id: string) => {
    const m = catalog?.models.find((x) => String(x.id) === id);
    if (m) setF({ ...f, modelId: m.id, brand: m.brand, model: `${m.model}${m.variant ? ` ${m.variant}` : ''}`, batteryKwh: Number(m.battery_kwh), maxAcKw: Number(m.max_ac_kw), maxDcKw: Number(m.max_dc_kw), connectors: m.connectors, curveProfile: m.curve_profile, efficiencyWhPerKm: m.efficiency_wh_km });
  };
  const save = async () => {
    setBusy(true);
    try {
      if (editing) await api.patch(`/me/vehicles/${editing.id}`, f); else await api.post('/me/vehicles', f);
      toast('success', editing ? 'Vehicle updated' : 'Vehicle added');
      onSaved(); onClose();
    } catch (e: any) { toast('error', 'Could not save vehicle', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!value} onClose={onClose} title={editing ? 'Edit vehicle' : 'Add a vehicle'} wide
      footer={<>{editing && <Button variant="ghost" className="mr-auto text-danger" onClick={async () => { await api.del(`/me/vehicles/${editing.id}`); onSaved(); onClose(); }}><Trash2 className="size-4" />Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!f.brand || !f.model || !f.connectors.length}>Save vehicle</Button></>}>
      <div className="space-y-4">
        <Field label="Start from a model (optional)" hint="Prefills typical specs — adjust them to match your car.">
          <Select value={f.modelId ?? ''} onChange={(e) => fromCatalog(e.target.value)}><option value="">Custom vehicle</option>{catalog?.models.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.model} {m.variant}</option>)}</Select>
        </Field>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Brand"><Input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field>
          <Field label="Model"><Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
          <Field label="Nickname"><Input value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} placeholder="e.g. Daily driver" /></Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Usable battery (kWh)"><Input type="number" step="0.1" value={f.batteryKwh} onChange={(e) => setF({ ...f, batteryKwh: Number(e.target.value) })} /></Field>
          <Field label="Max AC (kW)"><Input type="number" step="0.1" value={f.maxAcKw} onChange={(e) => setF({ ...f, maxAcKw: Number(e.target.value) })} /></Field>
          <Field label="Max DC (kW)"><Input type="number" value={f.maxDcKw} onChange={(e) => setF({ ...f, maxDcKw: Number(e.target.value) })} /></Field>
          <Field label="Efficiency (Wh/km)"><Input type="number" value={f.efficiencyWhPerKm} onChange={(e) => setF({ ...f, efficiencyWhPerKm: Number(e.target.value) })} /></Field>
        </div>
        <div>
          <div className="text-[13px] font-medium mb-2">Connectors</div>
          <div className="flex flex-wrap gap-2">{CONNECTOR_TYPES.map((c) => <Chip key={c} active={f.connectors.includes(c)} onClick={() => setF({ ...f, connectors: f.connectors.includes(c) ? f.connectors.filter((x) => x !== c) : [...f.connectors, c] })}>{CONNECTOR_LABELS[c]}</Chip>)}</div>
        </div>
        <Field label="DC charging curve"><Select value={f.curveProfile} onChange={(e) => setF({ ...f, curveProfile: e.target.value as CurveProfile })}>{Object.entries(CURVE_PROFILES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-5">
          <div><div className="flex justify-between text-[13px] mb-2"><span>Current battery</span><b>{f.currentSoc}%</b></div><Slider value={f.currentSoc} onChange={(v) => setF({ ...f, currentSoc: v })} accent="var(--warning)" /></div>
          <div><div className="flex justify-between text-[13px] mb-2"><span>Desired charge</span><b>{f.targetSoc}%</b></div><Slider value={f.targetSoc} onChange={(v) => setF({ ...f, targetSoc: Math.max(1, v) })} /></div>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<'card' | 'wallet' | 'local_gateway'>('card');
  const [label, setLabel] = useState('');
  const [last4, setLast4] = useState('');
  const [provider, setProvider] = useState('demo');
  const save = async () => {
    try {
      await api.post('/me/payment-methods', { type, provider, label: label || (type === 'card' ? `Card ending ${last4} (demo)` : `${provider} (demo)`), last4: type === 'card' ? last4 : undefined, brand: type === 'card' ? 'visa' : undefined });
      toast('success', 'Payment method added'); onSaved(); onClose();
    } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add payment method" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={type === 'card' && !/^\d{4}$/.test(last4)}>Add</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-violet-soft text-violet text-[13px] p-3">Demo mode: methods are stored as references only. In production, the provider&apos;s secure form (e.g. Stripe Elements) tokenises the card and only the token reaches Voltway.</div>
        <Field label="Type"><Select value={type} onChange={(e) => { setType(e.target.value as any); setProvider('demo'); }}><option value="card">Credit / debit card</option><option value="wallet">Digital wallet</option><option value="local_gateway">Local payment gateway</option></Select></Field>
        {type === 'card' ? <Field label="Last 4 digits (demo)"><Input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4242" inputMode="numeric" /></Field> : (
          <Field label="Provider"><Select value={provider} onChange={(e) => setProvider(e.target.value)}>{(type === 'wallet' ? ['demo', 'apple_pay', 'google_pay'] : ['demo', 'jazzcash', 'easypaisa', 'raast']).map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
        )}
        <Field label="Label (optional)"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function TicketModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ category: 'other', subject: '', description: '' });
  const save = async () => {
    try { await api.post('/complaints', f); toast('success', 'Ticket submitted', 'Our team will get back to you.'); setF({ category: 'other', subject: '', description: '' }); onSaved(); onClose(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Contact support" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={f.subject.length < 3 || f.description.length < 10}>Submit</Button></>}>
      <div className="space-y-4">
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="billing">Billing</option><option value="charger_fault">Charger fault</option><option value="station_info">Station information</option><option value="reservation">Reservation</option><option value="app">App</option><option value="other">Other</option></Select></Field>
        <Field label="Subject"><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Describe the problem"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function ProfilePage() {
  return <RequireRole><Suspense><Profile /></Suspense></RequireRole>;
}
