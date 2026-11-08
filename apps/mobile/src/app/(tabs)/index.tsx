import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatDistance, formatDuration, formatMoney, summarizePorts } from '@wattly/shared';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/hooks';
import { useLocation } from '@/lib/location';
import { useRealtime } from '@/lib/realtime';
import { openDirections } from '@/lib/directions';
import { scoreHex, stationHex, useColors, useIsDark } from '@/lib/theme';
import type { Station } from '@/lib/types';
import { Button, Chip, Row, ScorePill, SourceBadge, T } from '@/components/ui';

const toRegion = (lat: number, lng: number, d = 0.12): Region => ({ latitude: lat, longitude: lng, latitudeDelta: d, longitudeDelta: d });

export default function MapScreen() {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const loc = useLocation();
  const map = useRef<MapView>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);
  const [filters, setFilters] = useState({ available: false, dc: false, reliable: false, myPlugs: false });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const dRegion = useDebounced(region, 350);
  const dq = useDebounced(query, 300);
  const centered = useRef(false);

  useEffect(() => {
    if (loc.position && !centered.current) {
      centered.current = true;
      map.current?.animateToRegion(toRegion(loc.position.lat, loc.position.lng, 0.08), 600);
    }
  }, [loc.position]);

  const load = useCallback(async () => {
    if (!dRegion) return;
    const bbox = [dRegion.longitude - dRegion.longitudeDelta / 2, dRegion.latitude - dRegion.latitudeDelta / 2, dRegion.longitude + dRegion.longitudeDelta / 2, dRegion.latitude + dRegion.latitudeDelta / 2];
    try {
      const d = await api.get(`/stations${qs({
        bbox: bbox.map((n) => n.toFixed(4)).join(','), lat: loc.position?.lat, lng: loc.position?.lng, limit: 250,
        available: filters.available, currentTypes: filters.dc ? ['DC'] : [], minScore: filters.reliable ? 7 : null,
        connectors: filters.myPlugs ? me.defaultVehicle?.connectors ?? [] : [],
      })}`);
      setStations(d.stations);
    } catch { /* keep last results */ }
  }, [dRegion, filters, loc.position?.lat, me.defaultVehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  useRealtime('stations', (event, d) => {
    if (event !== 'port.status') return;
    setStations((list) => list.map((s) => {
      if (s.id !== d.stationId) return s;
      const ports = s.ports.map((p) => (p.id === d.portId ? { ...p, status: d.status, statusSource: d.source, statusUpdatedAt: d.updatedAt } : p));
      const summary = summarizePorts(ports);
      const comp = ports.filter((p) => p.compatible);
      return { ...s, ports, summary, compatibleAvailable: comp.filter((p) => p.status === 'available').length, status: { ...s.status, operational: summary.operationalStatus, source: d.source, updatedAt: d.updatedAt } };
    }));
  });
  useEffect(() => { if (selected) setSelected(stations.find((s) => s.id === selected.id) ?? selected); }, [stations]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dq.trim().length < 2) { setResults([]); return; }
    api.get(`/search?q=${encodeURIComponent(dq)}`).then((d) => setResults(d.results)).catch(() => setResults([]));
  }, [dq]);

  const markers = useMemo(() => stations.map((s) => {
    const tone = stationHex(s);
    const sel = selected?.id === s.id;
    return (
      <Marker key={`${s.id}:${tone.hex}:${sel}`} coordinate={{ latitude: s.lat, longitude: s.lng }} onPress={() => setSelected(s)} tracksViewChanges={false} anchor={{ x: 0.5, y: 1 }}>
        <View style={[styles.pin, { backgroundColor: tone.hex, borderColor: dark ? '#0b0e12' : '#fff', transform: [{ scale: sel ? 1.15 : 1 }] }]}>
          <Ionicons name="flash" size={11} color="#fff" />
          <Text style={styles.pinText}>{s.comingSoon ? 'Soon' : Math.round(s.maxPowerKw)}</Text>
          {s.reliability.score != null && !s.comingSoon && <Text style={[styles.pinScore]}>{s.reliability.score.toFixed(1)}</Text>}
        </View>
      </Marker>
    );
  }), [stations, selected?.id, dark]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={toRegion(loc.center.lat, loc.center.lng)}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        onPress={() => { setSelected(null); Keyboard.dismiss(); }}
      >
        {markers}
      </MapView>

      <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, gap: 8 }}>
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="search" size={18} color={c.subtle} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search city, area or station" placeholderTextColor={c.subtle} style={{ flex: 1, color: c.text, fontSize: 15 }} returnKeyType="search" />
          {query ? <Pressable onPress={() => setQuery('')} hitSlop={10}><Ionicons name="close-circle" size={18} color={c.subtle} /></Pressable> : null}
        </View>
        {results.length > 0 && (
          <View style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, maxHeight: 280, overflow: 'hidden' }}>
            <FlatList keyboardShouldPersistTaps="handled" data={results} keyExtractor={(r) => r.id} renderItem={({ item }) => (
              <Pressable onPress={() => { setQuery(''); setResults([]); Keyboard.dismiss(); if (item.stationId) router.push(`/station/${item.stationId}`); else map.current?.animateToRegion(toRegion(item.lat, item.lng, item.kind === 'place' ? 0.15 : 0.04), 600); }}
                style={{ flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' }}>
                <Ionicons name={item.kind === 'station' ? 'flash' : 'location-outline'} size={18} color={item.kind === 'station' ? c.accent : c.muted} />
                <View style={{ flex: 1 }}><T size={14} weight="600" numberOfLines={1}>{item.name}</T><T size={12} muted numberOfLines={1}>{item.address}</T></View>
              </Pressable>
            )} />
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {me.defaultVehicle && <Chip label="My plugs" icon="car-outline" active={filters.myPlugs} onPress={() => setFilters({ ...filters, myPlugs: !filters.myPlugs })} />}
          <Chip label="Available now" active={filters.available} onPress={() => setFilters({ ...filters, available: !filters.available })} />
          <Chip label="DC fast" active={filters.dc} onPress={() => setFilters({ ...filters, dc: !filters.dc })} />
          <Chip label="Reliable 7+" active={filters.reliable} onPress={() => setFilters({ ...filters, reliable: !filters.reliable })} />
        </ScrollView>
      </View>

      <View style={{ position: 'absolute', right: 12, bottom: selected ? 250 : 20, gap: 10 }}>
        <Pressable accessibilityLabel="Add a station" onPress={() => router.push('/add-station')} style={[styles.fab, { backgroundColor: c.surface, borderColor: c.border }]}><Ionicons name="add" size={22} color={c.text} /></Pressable>
        <Pressable accessibilityLabel="My location" onPress={() => { if (loc.position) map.current?.animateToRegion(toRegion(loc.position.lat, loc.position.lng, 0.05), 500); else loc.request(); }} style={[styles.fab, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="locate" size={20} color={loc.position ? c.electric : c.text} />
        </Pressable>
      </View>

      {loc.status === 'denied' && !selected && (
        <View style={[styles.banner, { backgroundColor: c.surface, borderColor: c.border, bottom: 20 }]}>
          <Ionicons name="location-outline" size={18} color={c.electric} />
          <T size={13} style={{ flex: 1 }}>Location is off — showing Lahore (demo region). Enable it to see distances.</T>
        </View>
      )}

      {selected && (
        <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border, paddingBottom: 14 }]}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T weight="700" size={16} numberOfLines={1}>{selected.name}</T>
              <T size={12.5} muted numberOfLines={1}>{selected.operator.name} · {selected.address}</T>
            </View>
            <Pressable onPress={() => setSelected(null)} hitSlop={10}><Ionicons name="close" size={22} color={c.muted} /></Pressable>
          </Row>
          <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <T size={13} weight="700" style={{ color: stationHex(selected).hex }}>{selected.comingSoon ? 'Coming soon' : `${selected.compatibleAvailable}/${selected.compatiblePorts} free · ${stationHex(selected).label}`}</T>
            {!selected.comingSoon && <SourceBadge source={selected.status.source} />}
          </Row>
          <Row gap={14} style={{ marginTop: 10 }}>
            <ScorePill score={selected.reliability.score} large />
            <View style={{ flex: 1, gap: 2 }}>
              {selected.pricing && <T size={14} weight="600">{formatMoney(selected.pricing.currentRate, selected.pricing.currency)}/kWh <T size={12} muted>{selected.pricing.periodLabel}</T></T>}
              <T size={13} muted>Up to {Math.round(selected.maxPowerKw)} kW{selected.travel ? ` · ${formatDistance(selected.travel.distanceKm)} · ${formatDuration(selected.travel.travelMinutes)} (est.)` : ''}</T>
              <T size={12} muted>{selected.reliability.checkins} driver check-ins{selected.rating != null ? ` · ★ ${selected.rating.toFixed(1)}` : ''}</T>
            </View>
          </Row>
          <Row gap={8} style={{ marginTop: 12 }}>
            <Button title="Directions" icon="navigate" variant="electric" style={{ flex: 1 }} onPress={() => openDirections(selected.lat, selected.lng, selected.name)} />
            <Button title="Details" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/station/${selected.id}`)} />
          </Row>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  pinText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  pinScore: { color: '#fff', fontWeight: '700', fontSize: 10, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  fab: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  sheet: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: 22, padding: 16, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  banner: { position: 'absolute', left: 12, right: 70, flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1 },
});
// keep scoreHex referenced for tree-shaking clarity
void scoreHex;
