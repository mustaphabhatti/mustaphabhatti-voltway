'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MapPinPlus, Plus, Trash2 } from 'lucide-react';
import { AMENITY_LABELS, CONNECTOR_LABELS, CONNECTOR_TYPES, LOCATION_TYPES, PAYMENT_METHOD_LABELS, type Amenity, type ConnectorType, type LocationType, type PaymentMethodKind } from '@voltway/shared';
import { api } from '@/lib/api';
import { useGeolocation } from '@/lib/geo';
import { useToast } from '@/lib/toast';
import { Button, Card, CardHeader, Chip, Field, Input, PageHeader, Select, Textarea, Toggle } from '@/components/ui';
import { Map } from '@/components/map';
import { SearchBox } from '@/components/station/SearchBox';
import { RequireRole } from '@/components/layout/RequireRole';

function AddStation() {
  const router = useRouter();
  const toast = useToast();
  const geo = useGeolocation();
  const [f, setF] = useState({
    name: '', address: '', city: '', country: 'PK', lat: null as number | null, lng: null as number | null, timezone: 'Asia/Karachi',
    locationType: 'public' as LocationType, comingSoon: false, is24_7: false, amenities: [] as string[], paymentMethods: [] as string[],
    networkName: '', priceNote: '', notes: '', ports: [{ connectorType: 'CCS2' as ConnectorType, maxPowerKw: 60, count: 1 }],
  });
  const [flyKey, setFlyKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const toggle = (k: 'amenities' | 'paymentMethods', v: string) => set({ [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] } as any);
  const submit = async () => {
    if (f.lat == null || f.lng == null) return toast('error', 'Place the pin on the map');
    setBusy(true);
    try {
      await api.post('/community/stations', { ...f, ports: f.comingSoon ? f.ports.filter((p) => p.maxPowerKw > 0) : f.ports, networkName: f.networkName || undefined, priceNote: f.priceNote || undefined, notes: f.notes || undefined });
      toast('success', 'Thanks! Station submitted', 'Our team reviews new locations before they appear on the map.');
      router.push('/profile#contributions');
    } catch (e: any) { toast('error', 'Could not submit', e.message); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <PageHeader title="Add a charging station" subtitle="Know a charger that isn't on the map, a new one under construction, or want to share your home charger? Add it for other drivers." />
      <Card>
        <CardHeader title="Location" subtitle="Search, or tap the map to drop the pin exactly where the chargers are." />
        <div className="px-5 pb-5 grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <SearchBox placeholder="Search an address or place" onPick={(r) => { set({ lat: r.lat, lng: r.lng, address: f.address || r.name, city: f.city || r.address.split(',')[0] }); setFlyKey(Date.now()); }} />
            <Field label="Station name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Grand Hotel parking level B1" /></Field>
            <Field label="Address"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
              <Field label="Country"><Select value={f.country} onChange={(e) => set({ country: e.target.value, timezone: e.target.value === 'AE' ? 'Asia/Dubai' : 'Asia/Karachi' })}><option value="PK">Pakistan</option><option value="AE">UAE</option></Select></Field>
            </div>
            <Field label="Type of location"><Select value={f.locationType} onChange={(e) => set({ locationType: e.target.value as LocationType })}>{(Object.keys(LOCATION_TYPES) as LocationType[]).map((l) => <option key={l} value={l}>{LOCATION_TYPES[l]}</option>)}</Select></Field>
            {f.locationType === 'residential' && <p className="text-xs text-muted">Home chargers are listed as restricted access. Share how drivers can contact you or book in the notes — never post private details you don&apos;t want public.</p>}
            <Button variant="ghost" size="sm" onClick={() => { if (geo.position && !geo.isFallback) { set({ lat: geo.position.lat, lng: geo.position.lng }); setFlyKey(Date.now()); } else geo.request(); }}><MapPinPlus className="size-4" />Use my current location</Button>
          </div>
          <div className="h-80 md:h-auto min-h-80 rounded-xl overflow-hidden border border-border">
            <Map center={f.lat != null ? { lat: f.lat, lng: f.lng! } : geo.position ?? { lat: 31.5204, lng: 74.3587 }} zoom={13} pin={f.lat != null ? { lat: f.lat, lng: f.lng! } : null}
              onMapClick={(p) => set({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) })} flyTo={f.lat != null ? { lat: f.lat, lng: f.lng!, zoom: 16, key: flyKey } : null} />
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Chargers" action={<Button size="sm" variant="outline" onClick={() => set({ ports: [...f.ports, { connectorType: 'Type2', maxPowerKw: 22, count: 1 }] })}><Plus className="size-4" />Add type</Button>} />
        <div className="px-5 pb-5 space-y-3">
          <Toggle checked={f.comingSoon} onChange={(v) => set({ comingSoon: v })} label="Coming soon / under construction" description="Shown with a 'coming soon' label; it can't be used yet." />
          {f.ports.map((p, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1fr_0.8fr_auto] gap-2 items-end rounded-xl bg-surface-2 p-3">
              <Field label="Connector"><Select value={p.connectorType} onChange={(e) => set({ ports: f.ports.map((x, j) => (j === i ? { ...x, connectorType: e.target.value as ConnectorType } : x)) })}>{CONNECTOR_TYPES.map((c) => <option key={c} value={c}>{CONNECTOR_LABELS[c]}</option>)}</Select></Field>
              <Field label="Power (kW)"><Input type="number" min={1} value={p.maxPowerKw} onChange={(e) => set({ ports: f.ports.map((x, j) => (j === i ? { ...x, maxPowerKw: Number(e.target.value) } : x)) })} /></Field>
              <Field label="How many"><Input type="number" min={1} max={20} value={p.count} onChange={(e) => set({ ports: f.ports.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x)) })} /></Field>
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set({ ports: f.ports.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Toggle checked={f.is24_7} onChange={(v) => set({ is24_7: v })} label="Open 24/7" />
        </div>
      </Card>
      <Card>
        <CardHeader title="Details (optional)" />
        <div className="px-5 pb-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Network / operator name"><Input value={f.networkName} onChange={(e) => set({ networkName: e.target.value })} placeholder="If you know it" /></Field>
            <Field label="Price info"><Input value={f.priceNote} onChange={(e) => set({ priceNote: e.target.value })} placeholder="e.g. Free for customers, PKR 70/kWh" /></Field>
          </div>
          <div><div className="text-[13px] font-medium mb-2">Amenities nearby</div><div className="flex flex-wrap gap-2">{(Object.keys(AMENITY_LABELS) as Amenity[]).map((a) => <Chip key={a} active={f.amenities.includes(a)} onClick={() => toggle('amenities', a)}>{AMENITY_LABELS[a]}</Chip>)}</div></div>
          <div><div className="text-[13px] font-medium mb-2">How to pay</div><div className="flex flex-wrap gap-2">{(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodKind[]).map((m) => <Chip key={m} active={f.paymentMethods.includes(m)} onClick={() => toggle('paymentMethods', m)}>{PAYMENT_METHOD_LABELS[m]}</Chip>)}</div></div>
          <Field label="Notes for drivers"><Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Access instructions, level / bay number, opening hours…" /></Field>
        </div>
      </Card>
      <div className="flex justify-end"><Button size="lg" loading={busy} onClick={submit} disabled={!f.name || !f.address || !f.city}>Submit station</Button></div>
    </div>
  );
}
export default function AddStationPage() { return <RequireRole><AddStation /></RequireRole>; }
