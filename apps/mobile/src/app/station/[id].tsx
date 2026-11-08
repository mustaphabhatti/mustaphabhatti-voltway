import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { AMENITY_LABELS, CHECKIN_OUTCOMES, CHECKIN_PROBLEMS, CONNECTOR_LABELS, PAYMENT_METHOD_LABELS, PORT_STATUS_LABELS, formatDuration, formatMoney, reliabilityLabel } from '@wattly/shared';
import { absoluteUrl, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useFetch } from '@/lib/hooks';
import { useLocation } from '@/lib/location';
import { useRealtime } from '@/lib/realtime';
import { openDirections } from '@/lib/directions';
import { pickPhoto, uploadStationPhoto } from '@/lib/photos';
import { clock, timeAgo } from '@/lib/format';
import { STATUS_HEX, stationHex, useColors } from '@/lib/theme';
import type { Port, Station } from '@/lib/types';
import { Badge, Button, Card, Chip, Divider, ErrorView, Fact, H, Input, Loading, Row, ScorePill, SocSlider, SourceBadge, T } from '@/components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function StationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { me } = useAuth();
  const loc = useLocation();
  const { data, error, loading, reload, setData } = useFetch<{ station: Station; favorite: boolean }>(`/stations/${id}${loc.position ? `?lat=${loc.position.lat}&lng=${loc.position.lng}` : ''}`, [loc.position?.lat]);
  const checkins = useFetch<any>(`/stations/${id}/checkins`);
  const photos = useFetch<any>(`/stations/${id}/photos`);
  const reviews = useFetch<any>(`/stations/${id}/reviews`);
  useRealtime(id ? `station:${id}` : null, (event, d) => {
    if (event !== 'port.status' || !data) return;
    setData({ ...data, station: { ...data.station, ports: data.station.ports.map((p) => (p.id === d.portId ? { ...p, status: d.status, statusSource: d.source, statusUpdatedAt: d.updatedAt } : p)), summary: d.summary } });
  });

  if (error) return <ErrorView error={error} onRetry={() => reload()} />;
  if (loading || !data) return <Loading label="Loading station…" />;
  const s = data.station;
  const tone = stationHex(s);
  const needAuth = () => { router.push('/login'); };
  const toggleFav = async () => {
    if (!me.user) return needAuth();
    if (data.favorite) await api.del(`/me/favorites/${s.id}`); else await api.put(`/me/favorites/${s.id}`);
    setData({ ...data, favorite: !data.favorite });
  };
  const startCharging = () => {
    if (!me.user) return needAuth();
    if (!s.integration.supportsRemoteStart) return Alert.alert('Start at the charger', 'This station does not support starting sessions from the app yet. Use the payment options at the charger.');
    const ports = s.ports.filter((p) => p.compatible && p.status === 'available');
    if (!me.defaultVehicle) return Alert.alert('Add your vehicle first', 'We need your car to check compatibility.', [{ text: 'Add vehicle', onPress: () => router.push('/vehicle') }, { text: 'Cancel', style: 'cancel' }]);
    if (!ports.length) return Alert.alert('No compatible port is free', 'Try again shortly or check in as waiting.');
    Alert.alert('Choose a port', `Charging to ${me.defaultVehicle.target_soc}%. Plug in first.`, [
      ...ports.slice(0, 4).map((p) => ({ text: `${p.label} · ${CONNECTOR_LABELS[p.connectorType]} ${p.maxPowerKw} kW`, onPress: async () => {
        try {
          const r = await api.post('/sessions', { portId: p.id, vehicleId: me.defaultVehicle.id, targetSoc: Math.max(me.defaultVehicle.target_soc, me.defaultVehicle.current_soc + 5) });
          router.push(`/session/${r.session.id}`);
        } catch (e: any) { Alert.alert('Could not start', e.message); }
      } })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: s.name, headerRight: () => <Pressable onPress={toggleFav} hitSlop={12}><Ionicons name={data.favorite ? 'heart' : 'heart-outline'} size={24} color={data.favorite ? c.danger : c.text} /></Pressable> }} />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(true); checkins.reload(true); }} />}>
        <Card style={{ gap: 10 }}>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Badge label={tone.label} color="#fff" bg={tone.hex} />
            {!s.comingSoon && <SourceBadge source={s.status.source} />}
            <Badge label={s.openNow.label} icon="time-outline" />
            {s.isDemo && <Badge label="Demo listing" />}
            {s.community && <Badge label="Added by drivers" />}
          </Row>
          <View>
            <T size={22} weight="800" style={{ letterSpacing: -0.4 }}>{s.name}</T>
            <T size={13} muted>{s.operator.name}{s.operator.verified ? ' ✓' : ''} · {s.address}, {s.city}</T>
          </View>
          {s.comingSoon && <T size={13} style={{ color: c.warning }}>Coming soon — reported as planned or under construction. It can&apos;t be used yet.</T>}
          {s.hostNotes ? <T size={13} muted>{s.hostNotes}</T> : null}
          <Row gap={12}>
            <ScorePill score={s.reliability.score} large />
            <View style={{ flex: 1 }}><T weight="700">{reliabilityLabel(s.reliability.score)}</T><T size={12} muted>{s.reliability.checkins} driver check-ins (12 months){s.reliability.lastSuccessAt ? ` · last success ${timeAgo(s.reliability.lastSuccessAt)}` : ''}</T></View>
          </Row>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Fact label="Available" value={`${s.summary.available}/${s.summary.total} ports`} sub={me.defaultVehicle ? `${s.compatibleAvailable} compatible free` : undefined} />
            <Fact label="Price now" value={s.pricing ? `${formatMoney(s.pricing.currentRate, s.pricing.currency)}/kWh` : '—'} sub={s.pricing?.periodLabel} />
            <Fact label="Max power" value={`${Math.round(s.maxPowerKw)} kW`} sub={[s.hasDC && 'DC', s.hasAC && 'AC'].filter(Boolean).join(' + ')} />
            <Fact label="Drive" value={s.travel ? formatDuration(s.travel.travelMinutes) : '—'} sub={s.travel ? `${s.travel.distanceKm} km` : 'Location off'} est />
          </Row>
          <Row gap={8}>
            <Button title="Directions" icon="navigate" variant="electric" style={{ flex: 1 }} onPress={() => openDirections(s.lat, s.lng, s.name)} />
            <Button title="Check in" icon="checkmark-circle-outline" variant="outline" style={{ flex: 1 }} onPress={() => (me.user ? router.push(`/checkin/${s.id}`) : needAuth())} />
          </Row>
          {!s.comingSoon && <Button title={s.integration.supportsRemoteStart ? 'Start charging' : 'Start at the charger'} icon="flash" onPress={startCharging} disabled={s.maintenanceMode} />}
        </Card>

        <Card style={{ gap: 4 }}>
          <H>Charging ports</H>
          {s.ports.map((p) => <PortRow key={p.id} p={p} />)}
          <T size={11.5} muted style={{ marginTop: 6 }}>{s.status.source === 'live' ? 'Status is live from the charger network.' : s.status.source === 'simulated' ? 'Status comes from the demo simulator — not real-time data.' : 'No live data connection — status is as last reported.'}</T>
        </Card>

        {!s.comingSoon && <EstimatorCard station={s} />}

        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}><H>Driver check-ins</H>{checkins.data?.stats && <T size={12} muted>{checkins.data.stats.ok} ok · {checkins.data.stats.fail} failed</T>}</Row>
          {(checkins.data?.checkins ?? []).slice(0, 8).map((ci: any) => (
            <View key={ci.id} style={{ gap: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T size={13.5} weight="700" style={{ color: ci.outcome === 'could_not_charge' ? c.danger : ci.outcome === 'waiting' ? c.warning : ci.outcome === 'comment' ? c.text : c.accent }}>{CHECKIN_OUTCOMES[ci.outcome as keyof typeof CHECKIN_OUTCOMES]}{ci.problem ? ` · ${CHECKIN_PROBLEMS[ci.problem as keyof typeof CHECKIN_PROBLEMS]}` : ''}</T>
                <T size={11.5} muted>{timeAgo(ci.created_at)}</T>
              </Row>
              <T size={12} muted>{ci.author}{ci.vehicle_label ? ` · ${ci.vehicle_label}` : ''}{ci.kw_observed ? ` · ${ci.kw_observed} kW` : ''}{ci.duration_min ? ` · ${ci.duration_min} min` : ''}</T>
              {ci.comment ? <T size={13.5}>{ci.comment}</T> : null}
              {ci.photo_url ? <Image source={{ uri: absoluteUrl(ci.photo_url) }} style={{ width: 140, height: 100, borderRadius: 10, marginTop: 4 }} /> : null}
            </View>
          ))}
          {!checkins.data?.checkins?.length && <T muted size={13}>No check-ins yet — be the first.</T>}
          <Button title="Check in" variant="outline" small onPress={() => (me.user ? router.push(`/checkin/${s.id}`) : needAuth())} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}><H>Photos</H>
            {me.user && <Pressable onPress={async () => { const a = await pickPhoto(); if (a) { try { await uploadStationPhoto(s.id, a); photos.reload(true); } catch (e: any) { Alert.alert('Upload failed', e.message); } } }}><T size={13} style={{ color: c.accent }} weight="600">+ Add photo</T></Pressable>}
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[...s.images.map((u) => ({ id: u, url: u })), ...(photos.data?.photos ?? [])].map((p: any) => <Image key={p.id} source={{ uri: absoluteUrl(p.url) }} style={{ width: 150, height: 110, borderRadius: 12, backgroundColor: c.surface2 }} />)}
          </ScrollView>
          {!s.images.length && !photos.data?.photos?.length && <T muted size={13}>No photos yet.</T>}
        </Card>

        {s.tariff && (
          <Card style={{ gap: 6 }}>
            <H>Pricing</H>
            <T size={26} weight="800">{formatMoney(s.pricing!.currentRate, s.pricing!.currency)}<T muted size={14}>/kWh · {s.pricing!.periodLabel}</T></T>
            <Kv k="Standard rate" v={`${formatMoney(s.tariff.baseRate, s.tariff.currency)}/kWh`} />
            {s.tariff.weekendRate != null && <Kv k="Weekend rate" v={`${formatMoney(s.tariff.weekendRate, s.tariff.currency)}/kWh`} />}
            {s.tariff.periods.map((p) => <Kv key={p.label} k={`${p.label} ${p.start}–${p.end}`} v={`${formatMoney(p.rate, s.tariff!.currency)}/kWh`} color={p.kind === 'peak' ? c.danger : c.accent} />)}
            <Kv k="Session fee" v={s.tariff.sessionFee ? formatMoney(s.tariff.sessionFee, s.tariff.currency) : 'None'} />
            <Kv k="Idle fee" v={s.tariff.idleFeePerMinute ? `${formatMoney(s.tariff.idleFeePerMinute, s.tariff.currency)}/min after ${s.tariff.idleGraceMinutes} min` : 'None'} />
            <Kv k="Parking" v={s.tariff.parkingFeePerHour ? `${formatMoney(s.tariff.parkingFeePerHour, s.tariff.currency)}/h` : 'Free while charging'} />
            {s.tariff.serviceChargePercent > 0 && <Kv k="Service charge" v={`${s.tariff.serviceChargePercent}%`} />}
            {s.tariff.dynamic.enabled && <T size={12} muted>Dynamic pricing: ×{s.tariff.dynamic.minMultiplier}–{s.tariff.dynamic.maxMultiplier} depending on demand.</T>}
          </Card>
        )}

        <Card style={{ gap: 8 }}>
          <H>Reviews {s.rating != null ? `· ★ ${s.rating.toFixed(1)} (${s.reviewCount})` : ''}</H>
          {(reviews.data?.reviews ?? []).slice(0, 4).map((r: any) => (
            <View key={r.id} style={{ gap: 2 }}><T size={13} weight="600">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {r.author}</T>{r.comment ? <T size={13.5} muted>{r.comment}</T> : null}</View>
          ))}
          {me.user && <ReviewForm stationId={s.id} onDone={() => { reviews.reload(true); reload(true); }} />}
        </Card>

        <Card style={{ gap: 6 }}>
          <H>Hours & amenities</H>
          <T size={14}>{s.is24_7 ? 'Open 24/7' : s.openingHours.length ? DAYS.map((d, i) => { const h = s.openingHours.filter((x) => x.day === i); return `${d} ${h.length ? h.map((x) => `${x.open}–${x.close}`).join(', ') : 'closed'}`; }).join('\n') : 'Hours not provided'}</T>
          <Divider />
          <Row gap={6} style={{ flexWrap: 'wrap' }}>{s.amenities.map((a) => <Badge key={a} label={AMENITY_LABELS[a as keyof typeof AMENITY_LABELS] ?? a} />)}</Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>{s.paymentMethods.map((m) => <Badge key={m} label={PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m} icon="card-outline" />)}</Row>
        </Card>
      </ScrollView>
    </>
  );
}

function PortRow({ p }: { p: Port }) {
  const c = useColors();
  return (
    <Row gap={12} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, opacity: p.compatible ? 1 : 0.55 }}>
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: p.currentType === 'DC' ? c.electricSoft : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <T size={11} weight="800" style={{ color: p.currentType === 'DC' ? c.electric : c.accent }}>{p.currentType}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T size={14} weight="700">{p.label} <T size={13} muted>{CONNECTOR_LABELS[p.connectorType]}</T></T>
        <T size={12} muted>{p.maxPowerKw} kW{p.voltage ? ` · ${p.voltage} V` : ''}{p.powerGroup ? ` · shared power` : ''}{!p.compatible ? ' · not compatible' : ''}</T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Row gap={5}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_HEX[p.status] }} /><T size={12.5} weight="600">{PORT_STATUS_LABELS[p.status]}</T></Row>
        <T size={10.5} muted>{p.statusSource === 'simulated' ? 'demo feed' : p.statusSource === 'live' ? 'live' : p.statusSource === 'user_reported' ? 'driver report' : 'reported'} · {timeAgo(p.statusUpdatedAt)}</T>
      </View>
    </Row>
  );
}

function Kv({ k, v, color }: { k: string; v: string; color?: string }) {
  return <Row style={{ justifyContent: 'space-between' }}><T size={13.5} muted>{k}</T><T size={13.5} weight="600" style={color ? { color } : undefined}>{v}</T></Row>;
}

function EstimatorCard({ station: s }: { station: Station }) {
  const c = useColors();
  const { me } = useAuth();
  const ports = useMemo(() => s.ports.filter((p) => p.compatible), [s.ports]);
  const [portId, setPortId] = useState<string | null>(null);
  const [start, setStart] = useState(me.defaultVehicle?.current_soc ?? 20);
  const [target, setTarget] = useState(me.defaultVehicle?.target_soc ?? 80);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!portId && ports.length) setPortId([...ports].sort((a, b) => b.maxPowerKw - a.maxPowerKw)[0].id); }, [ports, portId]);
  const p = useDebounced({ portId, start, target }, 300);
  useEffect(() => {
    if (!p.portId || p.target <= p.start) return;
    const body: any = { portId: p.portId, startSoc: p.start, targetSoc: p.target };
    if (me.defaultVehicle) body.vehicleId = me.defaultVehicle.id;
    else body.vehicle = { batteryKwh: 60, maxAcKw: 7.4, maxDcKw: 100 };
    api.post('/estimate', body).then((r) => { setRes(r); setErr(null); }).catch((e) => setErr(e.message));
  }, [p, me.defaultVehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ports.length) return null;
  const e = res?.estimate;
  return (
    <Card style={{ gap: 10 }}>
      <H>Charging estimate</H>
      <T size={12} muted>{me.defaultVehicle ? `${me.defaultVehicle.brand} ${me.defaultVehicle.model}` : 'Generic 60 kWh EV — add your car for accuracy'} · uses your car&apos;s charging curve</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {ports.map((x) => <Chip key={x.id} label={`${x.label} ${x.maxPowerKw}kW`} active={portId === x.id} onPress={() => setPortId(x.id)} />)}
      </ScrollView>
      <Row gap={16}><SocSlider label="From" value={start} onChange={(v) => setStart(Math.min(v, 95))} color={c.warning} /><SocSlider label="To" value={target} onChange={(v) => setTarget(Math.max(v, start + 1))} /></Row>
      {err && <T size={13} style={{ color: c.danger }}>{err}</T>}
      {e && (<>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Fact label="Time" value={formatDuration(e.durationMinutes)} sub={`done ~${clock(e.completionTime)}`} est />
          <Fact label="Cost" value={e.cost ? formatMoney(e.cost.total, e.cost.currency) : '—'} sub={e.cost ? `${e.energyFromChargerKwh} kWh billed` : undefined} est />
          <Fact label="Avg power" value={`${e.averagePowerKw} kW`} sub={e.limitingFactor === 'charger' ? 'charger-limited' : 'car-limited'} est />
          <Fact label="Peak power" value={`${e.peakPowerKw} kW`} sub={`charger ${e.chargerLimitKw} kW`} est />
        </Row>
        {res.windows && res.windows.savings > 0.5 && <T size={13} style={{ color: c.accent }}>Save {formatMoney(res.windows.savings, e.cost.currency)} ({res.windows.savingsPercent}%) by starting at {clock(res.windows.best.start)}.</T>}
        {e.warnings.map((w: string) => <T key={w} size={12.5} style={{ color: c.warning }}>{w}</T>)}
      </>)}
    </Card>
  );
}

function ReviewForm({ stationId, onDone }: { stationId: string; onDone: () => void }) {
  const c = useColors();
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  return (
    <View style={{ gap: 8, marginTop: 6 }}>
      <Row gap={4}>{[1, 2, 3, 4, 5].map((i) => <Pressable key={i} onPress={() => setStars(i)} hitSlop={6}><Ionicons name={i <= stars ? 'star' : 'star-outline'} size={26} color={c.warning} /></Pressable>)}</Row>
      {stars > 0 && (<>
        <Input value={text} onChangeText={setText} placeholder="How was charging here?" multiline />
        <Button title="Post review" small onPress={async () => { try { await api.post(`/stations/${stationId}/reviews`, { rating: stars, comment: text }); setStars(0); setText(''); onDone(); } catch (e: any) { Alert.alert('Could not post', e.message); } }} />
      </>)}
    </View>
  );
}
