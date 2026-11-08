'use client';
import Link from 'next/link';
import { Clock, Star, Zap } from 'lucide-react';
import { CONNECTOR_LABELS, formatDistance, formatDuration, formatMoney, type ConnectorType } from '@voltway/shared';
import type { Station } from '@/lib/types';
import { stationTone } from '@/lib/stationColor';
import { cn } from '@/lib/format';
import { EstimatedTag, SourceBadge } from './badges';
import { ReliabilityBadge } from './community';

export function connectorGroups(s: Station) {
  const groups = new Map<string, { type: ConnectorType; current: 'AC' | 'DC'; kw: number; total: number; available: number; compatible: boolean }>();
  for (const p of s.ports) {
    const key = `${p.connectorType}:${p.maxPowerKw}`;
    const g = groups.get(key) ?? { type: p.connectorType, current: p.currentType, kw: p.maxPowerKw, total: 0, available: 0, compatible: p.compatible };
    g.total++;
    if (p.status === 'available') g.available++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.kw - a.kw);
}

export function StationCard({ s, selected, onClick, href }: { s: Station; selected?: boolean; onClick?: () => void; href?: string }) {
  const tone = stationTone(s);
  const body = (
    <div className={cn('group rounded-2xl border bg-surface p-4 transition cursor-pointer', selected ? 'border-accent ring-4 ring-[var(--ring)]' : 'border-border hover:border-subtle/50 hover:shadow-card')}>
      <div className="flex items-start gap-3">
        <div className="size-10 shrink-0 rounded-xl grid place-items-center text-white" style={{ background: tone.hex }}>
          <Zap className="size-5" fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-[14.5px] leading-snug truncate">{s.name}</h3>
            {s.pricing && (
              <div className="text-right shrink-0">
                <div className="text-[14px] font-semibold tabular">{formatMoney(s.pricing.currentRate, s.pricing.currency)}</div>
                <div className="text-[10.5px] text-muted -mt-0.5">per kWh now</div>
              </div>
            )}
          </div>
          <div className="text-[12.5px] text-muted truncate">{s.operator.name} · {s.address}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12.5px]">
            <span className="font-medium" style={{ color: tone.hex }}>
              {s.status.operational === 'operational' || s.status.operational === 'partial'
                ? `${s.compatibleAvailable}/${s.compatiblePorts} ${s.compatiblePorts !== s.summary.total ? 'compatible ' : ''}free`
                : tone.label}
            </span>
            {s.travel && (
              <span className="text-muted inline-flex items-center gap-1">
                {formatDistance(s.travel.distanceKm)} · {formatDuration(s.travel.travelMinutes)}<EstimatedTag />
              </span>
            )}
            <span className="text-muted">Up to {Math.round(s.maxPowerKw)} kW</span>
            {s.rating != null && <span className="inline-flex items-center gap-0.5 text-muted"><Star className="size-3 fill-warning text-warning" />{s.rating.toFixed(1)}</span>}
            {s.openNow.open === false && <span className="inline-flex items-center gap-1 text-danger"><Clock className="size-3" />{s.openNow.label}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {connectorGroups(s).slice(0, 4).map((g) => (
              <span key={`${g.type}${g.kw}`} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', g.compatible ? 'bg-surface-2 text-text' : 'bg-surface-2 text-subtle line-through decoration-subtle/50')}>
                <span className={g.current === 'DC' ? 'text-electric' : 'text-accent'}>{g.current}</span>
                {CONNECTOR_LABELS[g.type]} {g.kw}kW
                <span className={g.available ? 'text-accent' : 'text-subtle'}>{g.available}/{g.total}</span>
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {s.comingSoon ? <span className="text-[11.5px] font-medium rounded-full px-2 py-0.5 bg-surface-2 text-muted border border-dashed border-border">Coming soon</span> : <ReliabilityBadge score={s.reliability.score} checkins={s.reliability.checkins} />}
            {!s.comingSoon && <SourceBadge source={s.status.source} updatedAt={s.status.updatedAt} stale={s.status.stale} compact />}
            {s.community && <span className="text-[11px] text-muted">Added by drivers</span>}
          </div>
        </div>
      </div>
    </div>
  );
  if (href) return <Link href={href} onClick={onClick}>{body}</Link>;
  return <div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick?.()}>{body}</div>;
}
