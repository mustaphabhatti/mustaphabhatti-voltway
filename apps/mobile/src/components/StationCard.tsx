import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CONNECTOR_LABELS, formatDistance, formatDuration, formatMoney } from '@voltway/shared';
import type { Station } from '@/lib/types';
import { stationHex, useColors } from '@/lib/theme';
import { Badge, Card, Row, ScorePill, SourceBadge, T } from './ui';

export function StationCard({ s, onPress }: { s: Station; onPress?: () => void }) {
  const c = useColors();
  const tone = stationHex(s);
  const groups = new Map<string, { label: string; free: number; total: number; dc: boolean }>();
  for (const p of s.ports) {
    const k = `${p.connectorType}${p.maxPowerKw}`;
    const g = groups.get(k) ?? { label: `${CONNECTOR_LABELS[p.connectorType]} ${p.maxPowerKw}kW`, free: 0, total: 0, dc: p.currentType === 'DC' };
    g.total++;
    if (p.status === 'available') g.free++;
    groups.set(k, g);
  }
  return (
    <Card onPress={onPress ?? (() => router.push(`/station/${s.id}`))} style={{ gap: 8 }}>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tone.hex, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="flash" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="700" numberOfLines={1}>{s.name}</T>
          <T size={12.5} muted numberOfLines={1}>{s.operator.name} · {s.address}</T>
          <Row gap={10} style={{ flexWrap: 'wrap', marginTop: 4 }}>
            <T size={12.5} weight="700" style={{ color: tone.hex }}>{s.comingSoon ? 'Coming soon' : ['operational', 'partial'].includes(s.status.operational) ? `${s.compatibleAvailable}/${s.compatiblePorts} free` : tone.label}</T>
            {s.travel && <T size={12.5} muted>{formatDistance(s.travel.distanceKm)} · {formatDuration(s.travel.travelMinutes)} est.</T>}
            <T size={12.5} muted>Up to {Math.round(s.maxPowerKw)} kW</T>
          </Row>
        </View>
        {s.pricing && (
          <View style={{ alignItems: 'flex-end' }}>
            <T weight="700" size={14}>{formatMoney(s.pricing.currentRate, s.pricing.currency)}</T>
            <T size={10.5} muted>per kWh now</T>
          </View>
        )}
      </Row>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {[...groups.values()].slice(0, 4).map((g) => (
          <View key={g.label} style={{ backgroundColor: c.surface2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
            <T size={11} weight="600"><T size={11} weight="700" style={{ color: g.dc ? c.electric : c.accent }}>{g.dc ? 'DC ' : 'AC '}</T>{g.label} <T size={11} style={{ color: g.free ? c.accent : c.subtle }}>{g.free}/{g.total}</T></T>
          </View>
        ))}
      </Row>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {!s.comingSoon && <ScorePill score={s.reliability.score} />}
        {!s.comingSoon && <SourceBadge source={s.status.source} updatedAt={s.status.updatedAt} />}
        {s.community && <Badge label="Added by drivers" />}
        {s.rating != null && <Badge label={`★ ${s.rating.toFixed(1)}`} />}
      </Row>
    </Card>
  );
}
