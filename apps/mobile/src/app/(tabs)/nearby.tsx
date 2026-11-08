import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CHECKIN_OUTCOMES, CHECKIN_PROBLEMS, RECOMMENDATION_MODES, formatDistance, formatDuration, formatMoney, type RecommendationMode } from '@voltway/shared';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useFetch } from '@/lib/hooks';
import { useLocation } from '@/lib/location';
import { timeAgo } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { Badge, Card, Chip, Empty, ErrorView, Loading, Row, ScorePill, SocSlider, T } from '@/components/ui';
import { StationCard } from '@/components/StationCard';

const MODES: RecommendationMode[] = ['balanced', 'fastest', 'closest', 'cheapest', 'least_wait'];

export default function Nearby() {
  const c = useColors();
  const { me } = useAuth();
  const loc = useLocation();
  const [tab, setTab] = useState<'smart' | 'all' | 'activity'>('smart');
  const [mode, setMode] = useState<RecommendationMode>('balanced');
  const [startSoc, setStartSoc] = useState(30);
  const [targetSoc, setTargetSoc] = useState(80);
  useEffect(() => { if (me.defaultVehicle) { setStartSoc(me.defaultVehicle.current_soc); setTargetSoc(Math.max(me.defaultVehicle.target_soc, me.defaultVehicle.current_soc + 5)); } }, [me.defaultVehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const soc = useDebounced({ startSoc, targetSoc }, 400);
  const [reco, setReco] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const all = useFetch<any>(tab === 'all' ? `/stations${qs({ lat: loc.center.lat, lng: loc.center.lng, radiusKm: 30, limit: 60 })}` : null, [tab, loc.position?.lat]);
  const activity = useFetch<any>(tab === 'activity' ? `/activity${qs({ lat: loc.center.lat, lng: loc.center.lng, radiusKm: 80 })}` : null, [tab]);

  const loadReco = () => {
    setLoading(true);
    api.post('/recommendations', { lat: loc.center.lat, lng: loc.center.lng, mode, startSoc: soc.startSoc, targetSoc: Math.max(soc.targetSoc, soc.startSoc + 5), radiusKm: 30 })
      .then((d) => { setReco(d); setErr(null); }).catch(setErr).finally(() => setLoading(false));
  };
  useEffect(() => { if (tab === 'smart') loadReco(); }, [tab, mode, soc, loc.position?.lat]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <Row gap={8}>
        <Chip label="Smart picks" icon="sparkles-outline" active={tab === 'smart'} onPress={() => setTab('smart')} />
        <Chip label="All nearby" active={tab === 'all'} onPress={() => setTab('all')} />
        <Chip label="Activity" icon="people-outline" active={tab === 'activity'} onPress={() => setTab('activity')} />
      </Row>
      <T size={12.5} muted>{loc.isFallback ? 'Near Lahore (demo region) — enable location for results near you' : 'Near your location'}</T>
      {tab === 'smart' && (
        <>
          <Card style={{ gap: 10 }}>
            <T size={13} weight="600">{reco?.vehicle?.name ?? (me.defaultVehicle ? `${me.defaultVehicle.brand} ${me.defaultVehicle.model}` : 'Generic EV (add your car in Account)')}</T>
            <Row gap={16}><SocSlider label="Battery now" value={startSoc} onChange={(v) => setStartSoc(Math.min(v, 95))} color={c.warning} /><SocSlider label="Charge to" value={targetSoc} onChange={setTargetSoc} /></Row>
          </Card>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MODES.map((m) => <Chip key={m} label={RECOMMENDATION_MODES[m].label} active={mode === m} onPress={() => setMode(m)} />)}
          </ScrollView>
        </>
      )}
    </View>
  );

  if (tab === 'smart')
    return (
      <FlatList
        style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 10 }}
        ListHeaderComponent={header}
        data={reco?.recommendations ?? []}
        keyExtractor={(r) => r.stationId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadReco} />}
        ListEmptyComponent={err ? <ErrorView error={err} onRetry={loadReco} /> : loading ? <Loading /> : <Empty title="No compatible stations within 30 km" />}
        renderItem={({ item: r }) => (
          <Card onPress={() => router.push(`/station/${r.stationId}`)} style={{ gap: 8, borderColor: r.rank === 1 ? c.accent : c.border }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: r.rank === 1 ? c.accent : c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                {r.rank === 1 ? <Ionicons name="trophy" size={17} color="#fff" /> : <T size={13} weight="700" muted>#{r.rank}</T>}
              </View>
              <View style={{ flex: 1 }}>
                <T weight="700" numberOfLines={1}>{r.name}</T>
                <T size={12} muted numberOfLines={1}>{r.station.operator.name} · {r.station.address}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}><T size={18} weight="800">{r.score}</T><T size={10} muted>score</T></View>
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>{r.badges.map((b: string) => <Badge key={b} label={b} color={c.accent} bg={c.accentSoft} />)}</Row>
            <Row gap={6}>
              {[['Drive', formatDuration(r.travelMinutes)], ['Wait', r.estimatedWaitMinutes ? `~${Math.round(r.estimatedWaitMinutes)}m` : 'None'], ['Charge', formatDuration(r.chargeMinutes)], ['Total', formatDuration(r.totalMinutes)], ['Cost', formatMoney(r.chargeCost, r.currency)]].map(([k, v]) => (
                <View key={k} style={{ flex: 1, backgroundColor: k === 'Total' || k === 'Cost' ? c.electricSoft : c.surface2, borderRadius: 10, padding: 6 }}>
                  <T size={10} muted>{k}</T><T size={12.5} weight="700" numberOfLines={1}>{v}</T>
                </View>
              ))}
            </Row>
            <T size={11.5} muted>{formatDistance(r.distanceKm)} · {r.bestPowerKw} kW {r.currentType} · {r.reasons.join(' · ')} · estimates</T>
          </Card>
        )}
      />
    );

  if (tab === 'all')
    return (
      <FlatList style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 10 }} ListHeaderComponent={header}
        data={all.data?.stations ?? []} keyExtractor={(s) => s.id} refreshControl={<RefreshControl refreshing={all.loading} onRefresh={() => all.reload()} />}
        ListEmptyComponent={all.error ? <ErrorView error={all.error} onRetry={() => all.reload()} /> : all.loading ? <Loading /> : <Empty title="No stations within 30 km" />}
        renderItem={({ item }) => <StationCard s={item} />} />
    );

  return (
    <FlatList style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 10 }} ListHeaderComponent={header}
      data={activity.data?.activity ?? []} keyExtractor={(a) => a.id} refreshControl={<RefreshControl refreshing={activity.loading} onRefresh={() => activity.reload()} />}
      ListEmptyComponent={activity.loading ? <Loading /> : <Empty icon="people-outline" title="No recent check-ins nearby" />}
      renderItem={({ item: a }) => (
        <Card onPress={() => router.push(`/station/${a.station_id}`)} style={{ gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}><T weight="700" numberOfLines={1} style={{ flex: 1 }}>{a.station_name}</T><T size={11.5} muted>{timeAgo(a.created_at)}</T></Row>
          <T size={13}><T size={13} weight="600" style={{ color: a.outcome === 'could_not_charge' ? c.danger : a.outcome === 'waiting' ? c.warning : c.accent }}>{CHECKIN_OUTCOMES[a.outcome as keyof typeof CHECKIN_OUTCOMES]}</T>{a.problem ? ` · ${CHECKIN_PROBLEMS[a.problem as keyof typeof CHECKIN_PROBLEMS]}` : ''}</T>
          <T size={12} muted>{a.author}{a.vehicle_label ? ` · ${a.vehicle_label}` : ''}{a.kw_observed ? ` · ${a.kw_observed} kW` : ''} · {a.city}</T>
          {a.comment ? <T size={13.5}>{a.comment}</T> : null}
        </Card>
      )} />
  );
}
void ScorePill;
