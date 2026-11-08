'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AMENITY_LABELS, CONNECTOR_LABELS, CONNECTOR_TYPES, PAYMENT_METHOD_LABELS, type Amenity, type ConnectorType, type PaymentMethodKind } from '@voltway/shared';
import { useFetch } from '@/lib/hooks';
import { Button, Card, CardHeader, Chip, Field, Input, Select, Textarea, Toggle } from '@/components/ui';
import { Map } from '@/components/map';
import { SearchBox } from '@/components/station/SearchBox';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'];

export interface PortDraft { label: string; connectorType: ConnectorType; maxPowerKw: number; voltage?: number | null; amperage?: number | null; powerGroup?: string | null; ocppConnectorId?: number | null }

export interface StationDraft {
  name: string; description: string; address: string; city: string; region: string; country: string; postalCode: string;
  lat: number | null; lng: number | null; timezone: string; phone: string; is24_7: boolean; openingHours: { day: number; open: string; close: string }[];
  amenities: string[]; paymentMethods: string[]; parkingInfo: string; accessType: string; tariffId: string | null; reservationsEnabled: boolean;
  reservationFee: number; integrationType: string; ports?: PortDraft[];
}

export const emptyStation = (): StationDraft => ({
  name: '', description: '', address: '', city: '', region: '', country: 'PK', postalCode: '', lat: null, lng: null, timezone: 'Asia/Karachi', phone: '',
  is24_7: true, openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '08:00', close: '22:00' })), amenities: [], paymentMethods: ['app', 'card'],
  parkingInfo: '', accessType: 'public', tariffId: null, reservationsEnabled: false, reservationFee: 0, integrationType: 'none',
  ports: [{ label: 'DC-1', connectorType: 'CCS2', maxPowerKw: 60, voltage: 750, amperage: 150 }],
});

export function stationToDraft(s: any): StationDraft {
  return {
    name: s.name, description: s.description ?? '', address: s.address, city: s.city, region: s.region ?? '', country: s.country, postalCode: s.postalCode ?? '',
    lat: s.lat, lng: s.lng, timezone: s.timezone, phone: s.phone ?? '', is24_7: s.is24_7,
    openingHours: s.openingHours?.length ? s.openingHours : [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '08:00', close: '22:00' })),
    amenities: s.amenities, paymentMethods: s.paymentMethods, parkingInfo: s.parkingInfo ?? '', accessType: s.accessType, tariffId: s.tariffId ?? null,
    reservationsEnabled: s.reservationsEnabled, reservationFee: Number(s.reservationFee ?? 0), integrationType: s.integration.type,
  };
}

export function draftToPayload(d: StationDraft) {
  return {
    ...d,
    description: d.description || null, region: d.region || null, postalCode: d.postalCode || null, phone: d.phone || null, parkingInfo: d.parkingInfo || null,
    openingHours: d.is24_7 ? [] : d.openingHours, lat: d.lat ?? undefined, lng: d.lng ?? undefined,
    ports: d.ports?.map((p) => ({ ...p, voltage: p.voltage || null, amperage: p.amperage || null, powerGroup: p.powerGroup || null })),
  };
}

export function StationForm({ value, onChange, showPorts }: { value: StationDraft; onChange: (v: StationDraft) => void; showPorts?: boolean }) {
  const { data: tariffs } = useFetch<any>('/operator/tariffs');
  const d = value;
  const set = <K extends keyof StationDraft>(k: K, v: StationDraft[K]) => onChange({ ...d, [k]: v });
  const toggle = (k: 'amenities' | 'paymentMethods', v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);
  const [flyKey, setFlyKey] = useState(0);
  useEffect(() => { if (d.lat != null) setFlyKey(Date.now()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Basic information" />
        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
          <Field label="Station name" className="sm:col-span-2"><Input value={d.name} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. BrightCharge Mall Road" /></Field>
          <Field label="Description" className="sm:col-span-2" hint="What drivers should know: covered bays, access instructions, nearby facilities."><Textarea value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Phone"><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+92…" /></Field>
          <Field label="Access"><Select value={d.accessType} onChange={(e) => set('accessType', e.target.value)}><option value="public">Public</option><option value="restricted">Restricted (customers / residents)</option><option value="private">Private</option></Select></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Location" subtitle="Search an address or click the map to place the station pin precisely." />
        <div className="px-5 pb-5 grid lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <SearchBox placeholder="Find address or area" onPick={(r) => { onChange({ ...d, lat: r.lat, lng: r.lng, address: d.address || r.name, city: d.city || (r.address.split(',')[0] ?? '') }); setFlyKey(Date.now()); }} />
            <Field label="Street address"><Input value={d.address} onChange={(e) => set('address', e.target.value)} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City"><Input value={d.city} onChange={(e) => set('city', e.target.value)} required /></Field>
              <Field label="Region / province"><Input value={d.region} onChange={(e) => set('region', e.target.value)} /></Field>
              <Field label="Country (ISO)"><Input value={d.country} maxLength={2} onChange={(e) => set('country', e.target.value.toUpperCase())} /></Field>
              <Field label="Postal code"><Input value={d.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></Field>
              <Field label="Latitude"><Input type="number" step="0.000001" value={d.lat ?? ''} onChange={(e) => set('lat', e.target.value === '' ? null : Number(e.target.value))} /></Field>
              <Field label="Longitude"><Input type="number" step="0.000001" value={d.lng ?? ''} onChange={(e) => set('lng', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            </div>
            <Field label="Time zone" hint="Used for opening hours and peak / off-peak pricing."><Select value={d.timezone} onChange={(e) => set('timezone', e.target.value)}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          </div>
          <div className="h-80 lg:h-auto min-h-80 rounded-xl overflow-hidden border border-border">
            <Map center={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : { lat: 31.5204, lng: 74.3587 }} zoom={d.lat != null ? 15 : 11}
              pin={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null} onMapClick={(p) => onChange({ ...d, lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) })}
              flyTo={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng, zoom: 15, key: flyKey } : null} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Opening hours" />
        <div className="px-5 pb-5 space-y-3">
          <Toggle checked={d.is24_7} onChange={(v) => set('is24_7', v)} label="Open 24 hours, 7 days a week" />
          {!d.is24_7 && (
            <div className="space-y-2">
              {DAYS.map((day, i) => {
                const h = d.openingHours.find((x) => x.day === i);
                return (
                  <div key={day} className="flex items-center gap-3">
                    <label className="w-24 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!h} onChange={(e) => set('openingHours', e.target.checked ? [...d.openingHours, { day: i, open: '08:00', close: '22:00' }] : d.openingHours.filter((x) => x.day !== i))} />{day}</label>
                    {h ? (<>
                      <Input type="time" value={h.open} className="w-32" onChange={(e) => set('openingHours', d.openingHours.map((x) => (x.day === i ? { ...x, open: e.target.value } : x)))} />
                      <span className="text-muted">–</span>
                      <Input type="time" value={h.close} className="w-32" onChange={(e) => set('openingHours', d.openingHours.map((x) => (x.day === i ? { ...x, close: e.target.value } : x)))} />
                    </>) : <span className="text-sm text-muted">Closed</span>}
                  </div>
                );
              })}
              <Button size="sm" variant="ghost" onClick={() => { const mon = d.openingHours.find((x) => x.day === 1) ?? { open: '08:00', close: '22:00' }; set('openingHours', [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: mon.open, close: mon.close }))); }}>Copy Monday to all days</Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Amenities, payment & parking" />
        <div className="px-5 pb-5 space-y-4">
          <div><div className="text-[13px] font-medium mb-2">Amenities</div><div className="flex flex-wrap gap-2">{(Object.keys(AMENITY_LABELS) as Amenity[]).map((a) => <Chip key={a} active={d.amenities.includes(a)} onClick={() => toggle('amenities', a)}>{AMENITY_LABELS[a]}</Chip>)}</div></div>
          <div><div className="text-[13px] font-medium mb-2">Payment methods accepted</div><div className="flex flex-wrap gap-2">{(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodKind[]).map((p) => <Chip key={p} active={d.paymentMethods.includes(p)} onClick={() => toggle('paymentMethods', p)}>{PAYMENT_METHOD_LABELS[p]}</Chip>)}</div></div>
          <Field label="Parking information"><Input value={d.parkingInfo} onChange={(e) => set('parkingInfo', e.target.value)} placeholder="e.g. Free for 2 hours while charging" /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Pricing, reservations & data connection" />
        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
          <Field label="Tariff" hint={tariffs?.tariffs?.length ? 'Create and edit tariffs on the Pricing page.' : 'No tariffs yet — create one on the Pricing page.'}>
            <Select value={d.tariffId ?? ''} onChange={(e) => set('tariffId', e.target.value || null)}><option value="">No published price</option>{tariffs?.tariffs?.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.config.currency} {t.config.baseRate}/kWh)</option>)}</Select>
          </Field>
          <Field label="Status data source" hint={d.integrationType === 'ocpp' ? 'Register the charger identity after saving; status becomes live when it connects.' : d.integrationType === 'simulator' ? 'Demo only — simulated availability, labelled as such to drivers.' : 'You update port status manually from the dashboard.'}>
            <Select value={d.integrationType} onChange={(e) => set('integrationType', e.target.value)}>
              <option value="none">Manual updates</option><option value="ocpp">OCPP 1.6J (live)</option><option value="operator_api">Operator API (custom)</option><option value="simulator">Demo simulator</option>
            </Select>
          </Field>
          <Toggle checked={d.reservationsEnabled} onChange={(v) => set('reservationsEnabled', v)} label="Accept reservations" description="Drivers can book a port up to 7 days ahead." />
          {d.reservationsEnabled && <Field label="Reservation fee"><Input type="number" min={0} value={d.reservationFee} onChange={(e) => set('reservationFee', Number(e.target.value))} /></Field>}
        </div>
      </Card>

      {showPorts && d.ports && (
        <Card>
          <CardHeader title="Charging ports" subtitle="Add each connector drivers can plug into." action={<Button size="sm" variant="outline" onClick={() => set('ports', [...d.ports!, { label: `P-${d.ports!.length + 1}`, connectorType: 'Type2', maxPowerKw: 22, voltage: 400, amperage: 32 }])}><Plus className="size-4" />Add port</Button>} />
          <div className="px-5 pb-5 space-y-2">
            {d.ports.map((p, i) => <PortFields key={i} p={p} onChange={(np) => set('ports', d.ports!.map((x, j) => (j === i ? np : x)))} onRemove={() => set('ports', d.ports!.filter((_, j) => j !== i))} />)}
            {!d.ports.length && <p className="text-sm text-muted">Add at least one port before submitting for review.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

export function PortFields({ p, onChange, onRemove }: { p: PortDraft; onChange: (p: PortDraft) => void; onRemove?: () => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-[1fr_1.3fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end rounded-xl bg-surface-2 p-3">
      <Field label="Label"><Input value={p.label} onChange={(e) => onChange({ ...p, label: e.target.value })} /></Field>
      <Field label="Connector"><Select value={p.connectorType} onChange={(e) => onChange({ ...p, connectorType: e.target.value as ConnectorType })}>{CONNECTOR_TYPES.map((c) => <option key={c} value={c}>{CONNECTOR_LABELS[c]}</option>)}</Select></Field>
      <Field label="Max kW"><Input type="number" min={1} value={p.maxPowerKw} onChange={(e) => onChange({ ...p, maxPowerKw: Number(e.target.value) })} /></Field>
      <Field label="Volts"><Input type="number" value={p.voltage ?? ''} onChange={(e) => onChange({ ...p, voltage: e.target.value ? Number(e.target.value) : null })} /></Field>
      <Field label="Amps"><Input type="number" value={p.amperage ?? ''} onChange={(e) => onChange({ ...p, amperage: e.target.value ? Number(e.target.value) : null })} /></Field>
      <Field label="Power group"><Input value={p.powerGroup ?? ''} placeholder="shared?" onChange={(e) => onChange({ ...p, powerGroup: e.target.value || null })} /></Field>
      {onRemove ? <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove port"><Trash2 className="size-4" /></Button> : <span />}
    </div>
  );
}
