import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ImagePickerAsset } from 'expo-image-picker';
import { CHECKIN_OUTCOMES, CHECKIN_PROBLEMS, type CheckinOutcome, type CheckinProblem } from '@wattly/shared';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { pickPhoto, uploadStationPhoto } from '@/lib/photos';
import { useColors } from '@/lib/theme';
import { Button, Chip, Input, Loading, Row, T } from '@/components/ui';

const ICON: Record<CheckinOutcome, keyof typeof Ionicons.glyphMap> = { charged: 'checkmark-circle', charging_now: 'flash', waiting: 'hourglass', could_not_charge: 'close-circle', comment: 'chatbubble-ellipses' };

export default function CheckinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { data } = useFetch<any>(`/stations/${id}`);
  const [outcome, setOutcome] = useState<CheckinOutcome>('charged');
  const [problem, setProblem] = useState<CheckinProblem>('broken');
  const [portId, setPortId] = useState<string | null>(null);
  const [kw, setKw] = useState('');
  const [minutes, setMinutes] = useState('');
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;
  const color: Record<CheckinOutcome, string> = { charged: c.accent, charging_now: c.electric, waiting: c.warning, could_not_charge: c.danger, comment: c.muted };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/stations/${id}/checkins`, { outcome, portId, problem: outcome === 'could_not_charge' ? problem : null, kwObserved: kw ? Number(kw) : null, durationMin: minutes ? Number(minutes) : null, comment });
      if (photo) await uploadStationPhoto(id!, photo, r.checkin.id).catch(() => Alert.alert('Photo upload failed'));
      Alert.alert('Thanks for checking in!', r.statusUpdated ? 'Port status updated for other drivers (shown as a driver report).' : 'Your check-in helps other drivers.');
      router.back();
    } catch (e: any) { Alert.alert('Could not check in', e.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <T weight="700" size={17}>{data.station.name}</T>
      <View style={{ gap: 8 }}>
        {(Object.keys(CHECKIN_OUTCOMES) as CheckinOutcome[]).map((o) => (
          <Pressable key={o} onPress={() => setOutcome(o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: outcome === o ? color[o] : c.border, backgroundColor: c.surface }}>
            <Ionicons name={ICON[o]} size={22} color={color[o]} /><T weight="600">{CHECKIN_OUTCOMES[o]}</T>
          </Pressable>
        ))}
      </View>
      {outcome === 'could_not_charge' && (
        <View style={{ gap: 8 }}><T size={13} weight="600">What went wrong?</T>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>{(Object.keys(CHECKIN_PROBLEMS) as CheckinProblem[]).map((p) => <Chip key={p} label={CHECKIN_PROBLEMS[p]} active={problem === p} onPress={() => setProblem(p)} />)}</Row>
        </View>
      )}
      {outcome !== 'comment' && (
        <View style={{ gap: 8 }}><T size={13} weight="600">Which port? (optional)</T>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>{data.station.ports.map((p: any) => <Chip key={p.id} label={`${p.label} · ${p.connectorType}`} active={portId === p.id} onPress={() => setPortId(portId === p.id ? null : p.id)} />)}</Row>
        </View>
      )}
      {(outcome === 'charged' || outcome === 'charging_now') && (
        <Row gap={10}>
          <View style={{ flex: 1 }}><Input label="Max kW seen" value={kw} onChangeText={setKw} keyboardType="numeric" placeholder="e.g. 95" /></View>
          <View style={{ flex: 1 }}><Input label={outcome === 'charging_now' ? 'Minutes left' : 'Minutes'} value={minutes} onChangeText={setMinutes} keyboardType="numeric" placeholder="e.g. 30" /></View>
        </Row>
      )}
      <Input label={outcome === 'comment' ? 'Comment' : 'Comment (optional)'} value={comment} onChangeText={setComment} placeholder="Tips: access, parking, speed, food nearby…" multiline maxLength={1000} />
      <Row gap={10}>
        <Button title={photo ? 'Change photo' : 'Add photo'} icon="camera-outline" variant="outline" small onPress={async () => setPhoto(await pickPhoto())} />
        {photo && <Image source={{ uri: photo.uri }} style={{ width: 56, height: 56, borderRadius: 10 }} />}
      </Row>
      <Button title="Post check-in" onPress={submit} loading={busy} disabled={outcome === 'comment' && !comment} />
    </ScrollView>
  );
}
