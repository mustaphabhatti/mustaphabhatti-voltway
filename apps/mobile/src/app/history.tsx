import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { formatDuration, formatMoney } from '@voltway/shared';
import { useFetch } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { Badge, Card, Empty, ErrorView, Loading, Row, T } from '@/components/ui';

export default function History() {
  const c = useColors();
  const { data, error, loading, reload } = useFetch<any>('/me/sessions');
  const t = data?.totals;
  return (
    <FlatList style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 10 }} data={data?.sessions ?? []} keyExtractor={(s) => s.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => reload()} />}
      ListHeaderComponent={t ? (
        <Row gap={8} style={{ marginBottom: 6 }}>
          {[['Sessions', String(t.sessions)], ['Energy', `${Math.round(t.energy)} kWh`], ['Spent', t.spend.map((x: any) => formatMoney(x.total, x.currency)).join(' + ') || '—']].map(([k, v]) => (
            <View key={k} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: c.border }}><T size={11.5} muted>{k}</T><T weight="800" size={15} numberOfLines={1}>{v}</T></View>
          ))}
        </Row>
      ) : undefined}
      ListEmptyComponent={error ? <ErrorView error={error} onRetry={() => reload()} /> : loading ? <Loading /> : <Empty icon="time-outline" title="No charging sessions yet" />}
      renderItem={({ item: s }) => (
        <Card onPress={() => router.push(`/session/${s.id}`)} style={{ gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}><T weight="700" numberOfLines={1} style={{ flex: 1 }}>{s.station_name}</T><T weight="700">{formatMoney(s.cost_total, s.currency)}</T></Row>
          <T size={12.5} muted>{dateTime(s.started_at)} · {Number(s.energy_kwh).toFixed(1)} kWh{s.ended_at ? ` · ${formatDuration((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)}` : ''}{s.start_soc != null ? ` · ${Math.round(s.start_soc)}→${Math.round(s.current_soc)}%` : ''}</T>
          <Row gap={6}><Badge label={s.status} color={s.status === 'completed' ? c.accent : c.muted} />{s.invoice_number && <Badge label={`Invoice ${s.invoice_number} · ${s.payment_status}`} />}{s.is_demo && <Badge label="demo" />}</Row>
        </Card>
      )} />
  );
}
