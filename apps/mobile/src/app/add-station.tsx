import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { router } from 'expo-router';
import { CONNECTOR_LABELS, CONNECTOR_TYPES, LOCATION_TYPES, type ConnectorType, type LocationType } from '@wattly/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocation } from '@/lib/location';
import { useColors, useIsDark } from '@/lib/theme';
import { Button, Card, Chip, Empty, Input, Row, T } from '@/components/ui';

export default function AddStation() {
  const c = useColors();
  const dark = useIsDark();
  const { me } = useAuth();
  const loc = useLocation();
  const map = useRef<MapView>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [type, setType] = useState<LocationType>('public');
  const [comingSoon, setComingSoon] = useState(false);
  const [is247, setIs247] = useState(false);
  const [connector, setConnector] = useState<ConnectorType>('CCS2');
  const [kw, setKw] = useState('60');
  const [count, setCount] = useState('1');
  const [priceNote, setPriceNote] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (loc.position && !pin) setPin(loc.position); }, [loc.position]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me.user) return <Empty icon="add-circle-outline" title="Sign in to add a station" action={<Button title="Sign in" onPress={() => router.push('/login')} />} />;
  const submit = async () => {
    if (!pin) return;
    setBusy(true);
    try {
      await api.post('/community/stations', {
        name, address, city, lat: pin.lat, lng: pin.lng, locationType: type, comingSoon, is24_7: is247, priceNote: priceNote || undefined, notes: notes || undefined,
        ports: kw ? [{ connectorType: connector, maxPowerKw: Number(kw), count: Math.max(1, Number(count) || 1) }] : [],
      });
      Alert.alert('Thanks!', 'Your station was submitted. Our team reviews new locations before they appear on the map.');
      router.back();
    } catch (e: any) { Alert.alert('Could not submit', e.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <T muted size={13}>Tap the map to place the pin where the chargers are.</T>
      <View style={{ height: 240, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
        <MapView ref={map} style={StyleSheet.absoluteFill} userInterfaceStyle={dark ? 'dark' : 'light'} showsUserLocation
          initialRegion={{ latitude: loc.center.lat, longitude: loc.center.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          onPress={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}>
          {pin && <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} draggable onDragEnd={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })} />}
        </MapView>
      </View>
      <Card style={{ gap: 12 }}>
        <Input label="Station name" value={name} onChangeText={setName} placeholder="e.g. Grand Hotel parking B1" />
        <Input label="Address" value={address} onChangeText={setAddress} />
        <Input label="City" value={city} onChangeText={setCity} />
        <T size={13} weight="600">Type of location</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>{(Object.keys(LOCATION_TYPES) as LocationType[]).map((l) => <Chip key={l} label={LOCATION_TYPES[l]} active={type === l} onPress={() => setType(l)} />)}</Row>
        <Row style={{ justifyContent: 'space-between' }}><T>Coming soon / under construction</T><Switch value={comingSoon} onValueChange={setComingSoon} trackColor={{ true: c.accent }} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><T>Open 24/7</T><Switch value={is247} onValueChange={setIs247} trackColor={{ true: c.accent }} /></Row>
      </Card>
      <Card style={{ gap: 12 }}>
        <T size={13} weight="600">Connector</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>{CONNECTOR_TYPES.map((t) => <Chip key={t} label={CONNECTOR_LABELS[t]} active={connector === t} onPress={() => setConnector(t)} />)}</Row>
        <Row gap={10}><View style={{ flex: 1 }}><Input label="Power (kW)" value={kw} onChangeText={setKw} keyboardType="numeric" /></View><View style={{ flex: 1 }}><Input label="How many" value={count} onChangeText={setCount} keyboardType="numeric" /></View></Row>
        <Input label="Price info (optional)" value={priceNote} onChangeText={setPriceNote} placeholder="e.g. Free for customers" />
        <Input label="Notes for drivers (optional)" value={notes} onChangeText={setNotes} multiline />
      </Card>
      <Button title="Submit station" onPress={submit} loading={busy} disabled={!pin || name.length < 3 || address.length < 5 || city.length < 2} />
    </ScrollView>
  );
}
