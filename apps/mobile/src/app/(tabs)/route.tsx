import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatDistance, formatDuration, formatMoney } from '@wattly/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useFetch } from '@/lib/hooks';
import { useLocation } from '@/lib/location';
import { openRouteInGoogleMaps } from '@/lib/directions';
import { clock } from '@/lib/format';
import { useColors, useIsDark } from '@/lib/theme';
import { Button, Card, Chip, Empty, Input, Row, SocSlider, T } from '@/components/ui';

type Pt = { lat: number; lng: number; label: string };
const QUICK: [string, Pt, Pt][] = [
  ['Lahore → Islamabad', { lat: 31.5204, lng: 74.3587, label: 'Lahore' }, { lat: 33.6844, lng: 73.0479, label: 'Islamabad' }],
  ['Karachi → Hyderabad', { lat: 24.8607, lng: 67.0011, label: 'Karachi' }, { lat: 25.396, lng: 68.3578, label: 'Hyderabad' }],
  ['Dubai → Abu Dhabi', { lat: 25.2048, lng: 55.2708, label: 'Dubai' }, { lat: 24.4539, lng: 54.3773, label: 'Abu Dhabi' }],
];

function PlaceInput({ label, value, onPick }: { label: string; value: Pt | null; onPick: (p: Pt) => void }) {
  const c = useColors();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const dq = useDebounced(q, 300);
  const [results, setResults] = useState<any[]>([]);
  useEffect(() => {
    if (dq.trim().length < 2) { setResults([]); return; }
    api.get(`/search?q=${encodeURIComponent(dq)}`).then((d) => setResults(d.results.slice(0, 5))).catch(() => setResults([]));
  }, [dq]);
  return (
    <View style={{ gap: 4 }}>
      <Input label={label} value={editing ? q : value?.label ?? q} onFocus={() => { setEditing(true); setQ(''); }} onChangeText={setQ} placeholder="City, area, address or station" />
      {editing && results.map((r) => (
        <Pressable key={r.id} onPress={() => { onPick({ lat: r.lat, lng: r.lng, label: r.name }); setEditing(false); setResults([]); }} style={{ padding: 10, borderRadius: 10, backgroundColor: c.surface2 }}>
          <T size={14} weight="600">{r.name}</T><T size={12} muted numberOfLines={1}>{r.address}</T>
        </Pressable>
      ))}
    </View>
  );
}

export default function RouteScreen() {
  const c = useColors();
  const dark = useIsDark();
  const { me } = useAuth();
  const loc = useLocation();
  const vehicles = useFetch<any>(me.user ? '/me/vehicles' : null, [me.user?.id]);
  const map = useRef<MapView>(null);
  const [from, setFrom] = useState<Pt | null>(null);
  const [to, setTo] = useState<Pt | null>(null);
  const [startSoc, setStartSoc] = useState(70);
  const [reserve, setReserve] = useState(15);
  const [result, setResult] = useState<any>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (loc.position && !from) setFrom({ ...loc.position, label: 'My location' }); }, [loc.position]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (me.defaultVehicle) setStartSoc(me.defaultVehicle.current_soc); }, [me.defaultVehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = async () => {
    if (!from || !to) return setError('Choose a start and destination');
    setBusy(true); setError(null);
    try {
      const v = vehicles.data?.vehicles?.find((x: any) => x.is_default) ?? vehicles.data?.vehicles?.[0];
      const body: any = { from, to, startSoc, minArrivalSoc: reserve };
      if (v) body.vehicleId = v.id;
      else body.vehicle = { batteryKwh: 60, maxAcKw: 7.4, maxDcKw: 100, efficiencyWhPerKm: 170, connectors: ['CCS2', 'Type2'] };
      const r = await api.post('/routes/plan', body);
      setResult(r); setActive(0);
      const g = r.options[0].route.geometry;
      setTimeout(() => map.current?.fitToCoordinates(g.map((p: any) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: { top: 40, bottom: 40, left: 40, right: 40 }, animated: true }), 300);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const opt = result?.options?.[active];
  const coords = useMemo(() => opt?.route.geometry.map((p: any) => ({ latitude: p.lat, longitude: p.lng })) ?? [], [opt]);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 12 }}>
        <PlaceInput label="From" value={from} onPick={setFrom} />
        <PlaceInput label="To" value={to} onPick={setTo} />
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Chip label="Swap" icon="swap-vertical" onPress={() => { setFrom(to); setTo(from); }} />
          {QUICK.map(([l, a, b]) => <Chip key={l} label={l} onPress={() => { setFrom(a); setTo(b); }} />)}
        </Row>
        <Row gap={16}><SocSlider label="Battery now" value={startSoc} onChange={(v) => setStartSoc(Math.max(1, v))} color={c.warning} /><SocSlider label="Arrive with ≥" value={reserve} max={40} onChange={(v) => setReserve(Math.max(5, v))} color={c.electric} /></Row>
        {error && <T size={13} style={{ color: c.danger }}>{error}</T>}
        <Button title="Plan EV route" icon="git-branch-outline" onPress={plan} loading={busy} disabled={!from || !to} />
        {!me.user && <T size={12} muted>Sign in to plan with your own vehicle — using a generic 60 kWh EV.</T>}
      </Card>

      {!result ? <Empty icon="map-outline" title="Where are you going?" body="We find compatible chargers along the way and estimate your battery at every stop." /> : (
        <>
          <View style={{ height: 260, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
            <MapView ref={map} style={StyleSheet.absoluteFill} userInterfaceStyle={dark ? 'dark' : 'light'}
              initialRegion={{ latitude: from!.lat, longitude: from!.lng, latitudeDelta: 3, longitudeDelta: 3 }}>
              <Polyline coordinates={coords} strokeColor="#2f6bff" strokeWidth={5} lineDashPattern={opt?.route.approximate ? [8, 8] : undefined} />
              {opt?.plan.stops.map((s: any, i: number) => (
                <Marker key={s.candidate.stationId} coordinate={{ latitude: s.candidate.lat, longitude: s.candidate.lng }} title={s.candidate.name} description={`${s.chargeMinutes} min charge`} tracksViewChanges={false}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.accent, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><T size={11} weight="800" style={{ color: '#fff' }}>{i + 1}</T></View>
                </Marker>
              ))}
              {from && <Marker coordinate={{ latitude: from.lat, longitude: from.lng }} title={from.label} pinColor="#2f6bff" />}
              {to && <Marker coordinate={{ latitude: to.lat, longitude: to.lng }} title={to.label} />}
            </MapView>
          </View>
          {result.approximate && <T size={12} muted>No online routing service reachable — the route is approximate. Use the navigation hand-off for turn-by-turn guidance.</T>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {result.options.map((o: any, i: number) => (
              <Pressable key={o.id} onPress={() => setActive(i)} style={{ width: 200, padding: 12, borderRadius: 16, borderWidth: 2, borderColor: i === active ? c.electric : c.border, backgroundColor: c.surface }}>
                <T weight="700" size={14}>{o.label}</T>
                <T size={20} weight="800">{formatDuration(o.plan.totalMinutes)}</T>
                <T size={12} muted>{formatDistance(o.route.distanceKm)} · {o.plan.stops.length} stop{o.plan.stops.length === 1 ? '' : 's'} · arrive {Math.round(o.plan.arrivalSoc)}%</T>
                {!o.plan.feasible && <T size={12} style={{ color: c.danger }}>Not feasible</T>}
              </Pressable>
            ))}
          </ScrollView>
          {opt && (
            <Card style={{ gap: 12 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View><T size={12} muted>Drive</T><T weight="700">{formatDuration(opt.plan.driveMinutes)}</T></View>
                <View><T size={12} muted>Charging</T><T weight="700">{formatDuration(opt.plan.chargeMinutes + opt.plan.waitMinutes)}</T></View>
                <View><T size={12} muted>Arrive</T><T weight="700">{clock(opt.plan.arriveAt)}</T></View>
                <View><T size={12} muted>Cost</T><T weight="700">{Object.entries(opt.plan.totalChargingCost).map(([cur, v]) => formatMoney(v as number, cur)).join(' + ') || '—'}</T></View>
              </Row>
              {opt.plan.warnings.map((w: string) => <T key={w} size={13} style={{ color: c.danger }}>{w}</T>)}
              <Step icon="radio-button-on" color={c.electric} title={result.from.label} sub={`${result.startSoc}% battery`} />
              {opt.plan.stops.map((s: any, i: number) => (
                <Pressable key={s.candidate.stationId} onPress={() => router.push(`/station/${s.candidate.stationId}`)}>
                  <Step icon="flash" color={c.accent} title={`${i + 1}. ${s.candidate.name}`}
                    sub={`Arrive ${Math.round(s.arrivalSoc)}% → charge to ${Math.round(s.departureSoc)}% · ${formatDuration(s.chargeMinutes)}${s.waitMinutes ? ` +${s.waitMinutes}m wait` : ''} · ${s.candidate.powerKw} kW · ${s.cost != null ? formatMoney(s.cost, s.currency) : ''}`} />
                </Pressable>
              ))}
              <Step icon="flag" color={c.text} title={result.to.label} sub={`Arrive ~${clock(opt.plan.arriveAt)} with ${Math.round(opt.plan.arrivalSoc)}%`} />
              <T size={11.5} muted>Battery levels, times and costs are estimates. {opt.plan.notes.join(' ')}</T>
              <Button title="Navigate in Google Maps" icon="navigate" variant="electric" onPress={() => openRouteInGoogleMaps(from!, to!, opt.plan.stops.map((s: any) => s.candidate))} />
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Step({ icon, color, title, sub }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; sub: string }) {
  return (
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={color} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}><T weight="600" size={14}>{title}</T><T size={12.5} muted>{sub}</T></View>
    </Row>
  );
}
