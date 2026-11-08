'use client';
import { CONNECTOR_LABELS } from '@wattly/shared';
import type { Port } from '@/lib/types';
import { cn } from '@/lib/format';
import { PortStatusBadge, SourceBadge } from './badges';

export function PortList({ ports, onSelect, selectedId, showSource = true }: { ports: Port[]; onSelect?: (p: Port) => void; selectedId?: string | null; showSource?: boolean }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
      {ports.map((p) => (
        <button key={p.id} type="button" disabled={!onSelect} onClick={() => onSelect?.(p)}
          className={cn('w-full text-left flex items-center gap-3 px-3.5 py-3 bg-surface transition', onSelect && 'hover:bg-surface-2', selectedId === p.id && 'bg-accent-soft/50', !p.compatible && 'opacity-60')}>
          <div className={cn('size-10 shrink-0 rounded-lg grid place-items-center text-[11px] font-bold', p.currentType === 'DC' ? 'bg-electric-soft text-electric' : 'bg-accent-soft text-accent')}>
            {p.currentType}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{p.label}</span>
              <span className="text-[13px] text-muted">{CONNECTOR_LABELS[p.connectorType]}</span>
              {!p.compatible && <span className="text-[11px] text-danger">Not compatible with your car</span>}
            </div>
            <div className="text-xs text-muted mt-0.5 tabular">
              {p.maxPowerKw} kW max{p.voltage ? ` · ${p.voltage} V` : ''}{p.amperage ? ` · ${p.amperage} A` : ''}{p.powerGroup ? ` · shared power cabinet ${p.powerGroup}` : ''}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <PortStatusBadge status={p.status} />
            {showSource && <SourceBadge source={p.statusSource} updatedAt={p.statusUpdatedAt} stale={p.statusStale} compact />}
          </div>
        </button>
      ))}
    </div>
  );
}
