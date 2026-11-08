'use client';
import { SlidersHorizontal, X } from 'lucide-react';
import { AMENITY_LABELS, CONNECTOR_LABELS, type Amenity, type ConnectorType } from '@voltway/shared';
import { Button, Chip, Field, Select, Slider, Toggle } from '@/components/ui';
import { useFetch } from '@/lib/hooks';

export interface FilterState {
  connectors: ConnectorType[];
  currentTypes: ('AC' | 'DC')[];
  minPowerKw: number;
  maxPrice: number | null;
  available: boolean;
  openNow: boolean;
  is247: boolean;
  amenities: string[];
  networks: string[];
  radiusKm: number;
  sort: 'distance' | 'power' | 'price' | 'availability' | 'rating';
}

export const DEFAULT_FILTERS: FilterState = {
  connectors: [], currentTypes: [], minPowerKw: 0, maxPrice: null, available: false, openNow: false, is247: false, amenities: [], networks: [], radiusKm: 25, sort: 'distance',
};

export function activeFilterCount(f: FilterState) {
  return f.connectors.length + f.currentTypes.length + (f.minPowerKw ? 1 : 0) + (f.maxPrice ? 1 : 0) + (f.available ? 1 : 0) + (f.openNow ? 1 : 0) + (f.is247 ? 1 : 0) + f.amenities.length + f.networks.length;
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const POWER_STEPS = [0, 7, 22, 50, 100, 150];
const COMMON_CONNECTORS: ConnectorType[] = ['CCS2', 'Type2', 'CHAdeMO', 'GBT_DC', 'GBT_AC', 'CCS1', 'NACS', 'Type1'];

export function QuickFilters({ f, set, onOpen, vehicleConnectors }: { f: FilterState; set: (f: FilterState) => void; onOpen: () => void; vehicleConnectors?: ConnectorType[] }) {
  const n = activeFilterCount(f);
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5">
      <Chip active={n > 0} onClick={onOpen}><SlidersHorizontal className="size-3.5" /> Filters{n ? ` · ${n}` : ''}</Chip>
      {vehicleConnectors?.length ? (
        <Chip active={vehicleConnectors.every((c) => f.connectors.includes(c)) && f.connectors.length === vehicleConnectors.length} onClick={() => set({ ...f, connectors: f.connectors.length ? [] : vehicleConnectors })}>My car&apos;s plugs</Chip>
      ) : null}
      <Chip active={f.available} onClick={() => set({ ...f, available: !f.available })}>Available now</Chip>
      <Chip active={f.currentTypes.includes('DC')} onClick={() => set({ ...f, currentTypes: toggle(f.currentTypes, 'DC') })}>DC fast</Chip>
      <Chip active={f.minPowerKw >= 100} onClick={() => set({ ...f, minPowerKw: f.minPowerKw >= 100 ? 0 : 100 })}>100 kW+</Chip>
      <Chip active={f.openNow} onClick={() => set({ ...f, openNow: !f.openNow })}>Open now</Chip>
      <Chip active={f.is247} onClick={() => set({ ...f, is247: !f.is247 })}>24/7</Chip>
    </div>
  );
}

export function FilterPanel({ f, set, onClose, resultCount, showRadius }: { f: FilterState; set: (f: FilterState) => void; onClose: () => void; resultCount?: number; showRadius?: boolean }) {
  const { data: meta } = useFetch<any>('/stations/meta');
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-semibold">Filters</h2>
        <button onClick={onClose} aria-label="Close filters" className="text-subtle hover:text-text"><X className="size-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-6">
        <section>
          <h3 className="text-[13px] font-semibold mb-2">Connector type</h3>
          <div className="flex flex-wrap gap-2">
            {COMMON_CONNECTORS.map((c) => <Chip key={c} active={f.connectors.includes(c)} onClick={() => set({ ...f, connectors: toggle(f.connectors, c) })}>{CONNECTOR_LABELS[c]}</Chip>)}
          </div>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">Charging type</h3>
          <div className="flex gap-2">
            <Chip active={f.currentTypes.includes('AC')} onClick={() => set({ ...f, currentTypes: toggle(f.currentTypes, 'AC') })}>AC (slow / destination)</Chip>
            <Chip active={f.currentTypes.includes('DC')} onClick={() => set({ ...f, currentTypes: toggle(f.currentTypes, 'DC') })}>DC (fast)</Chip>
          </div>
        </section>
        <section>
          <div className="flex justify-between mb-2"><h3 className="text-[13px] font-semibold">Minimum power</h3><span className="text-[13px] text-muted tabular">{f.minPowerKw ? `${f.minPowerKw} kW+` : 'Any'}</span></div>
          <Slider value={POWER_STEPS.indexOf(f.minPowerKw) === -1 ? 0 : POWER_STEPS.indexOf(f.minPowerKw)} min={0} max={POWER_STEPS.length - 1} onChange={(i) => set({ ...f, minPowerKw: POWER_STEPS[i] })} />
          <div className="flex justify-between text-[11px] text-subtle mt-1">{POWER_STEPS.map((p) => <span key={p}>{p || 'Any'}</span>)}</div>
        </section>
        {showRadius && (
          <section>
            <div className="flex justify-between mb-2"><h3 className="text-[13px] font-semibold">Distance</h3><span className="text-[13px] text-muted tabular">within {f.radiusKm} km</span></div>
            <Slider value={f.radiusKm} min={2} max={100} onChange={(v) => set({ ...f, radiusKm: v })} />
          </section>
        )}
        <section>
          <Field label="Max price per kWh (current rate)" hint="Uses each station's price right now, including peak/off-peak rules.">
            <Select value={f.maxPrice ?? ''} onChange={(e) => set({ ...f, maxPrice: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any price</option>
              {[60, 75, 90, 105, 120].map((p) => <option key={p} value={p}>Up to PKR {p}</option>)}
              {[1, 1.25, 1.5].map((p) => <option key={p} value={p}>Up to AED {p}</option>)}
            </Select>
          </Field>
        </section>
        <section className="space-y-3">
          <h3 className="text-[13px] font-semibold">Availability & hours</h3>
          <Toggle checked={f.available} onChange={(v) => set({ ...f, available: v })} label="Has a free compatible port" description="Based on the latest live, demo or reported status" />
          <Toggle checked={f.openNow} onChange={(v) => set({ ...f, openNow: v })} label="Open now" />
          <Toggle checked={f.is247} onChange={(v) => set({ ...f, is247: v })} label="Open 24/7" />
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">Amenities</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(AMENITY_LABELS) as Amenity[]).map((a) => <Chip key={a} active={f.amenities.includes(a)} onClick={() => set({ ...f, amenities: toggle(f.amenities, a) })}>{AMENITY_LABELS[a]}</Chip>)}
          </div>
        </section>
        {meta?.networks?.length > 0 && (
          <section>
            <h3 className="text-[13px] font-semibold mb-2">Charging network</h3>
            <div className="flex flex-wrap gap-2">
              {meta.networks.map((n: any) => (
                <Chip key={n.slug} active={f.networks.includes(n.slug)} onClick={() => set({ ...f, networks: toggle(f.networks, n.slug) })}>
                  <span className="size-2 rounded-full" style={{ background: n.brand_color }} />{n.name}<span className="text-subtle">{n.stations}</span>
                </Chip>
              ))}
            </div>
          </section>
        )}
        <section>
          <Field label="Sort by">
            <Select value={f.sort} onChange={(e) => set({ ...f, sort: e.target.value as FilterState['sort'] })}>
              <option value="distance">Distance</option>
              <option value="availability">Availability</option>
              <option value="power">Charging speed</option>
              <option value="price">Price (now)</option>
              <option value="rating">Rating</option>
            </Select>
          </Field>
        </section>
      </div>
      <div className="p-4 border-t border-border flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => set({ ...DEFAULT_FILTERS, radiusKm: f.radiusKm })}>Reset</Button>
        <Button className="flex-1" onClick={onClose}>Show {resultCount != null ? `${resultCount} ` : ''}stations</Button>
      </div>
    </div>
  );
}
