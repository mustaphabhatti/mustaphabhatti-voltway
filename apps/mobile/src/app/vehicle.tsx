import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useColors } from '@/lib/theme';
import { Button, Card, Chip, Empty, Loading, Row, SocSlider, T } from '@/components/ui';

export default function VehicleScreen() {
  const c = useColors();
  const { me, refresh } = useAuth();
  const mine = useFetch<any>(me.user ? '/me/vehicles' : null);
  const catalog = useFetch<any>('/vehicle-models');
  const v = mine.data?.vehicles?.find((x: any) => x.is_default) ?? mine.data?.vehicles?.[0];
  const [soc, setSoc] = useState(50);
  const [target, setTarget] = useState(80);
  const [modelId, setModelId] = useState<number | null>(null);
  useEffect(() => { if (v) { setSoc(v.current_soc); setTarget(v.target_soc); } }, [v?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me.user) return <Empty title="Sign in to add your vehicle" action={<Button title="Sign in" onPress={() => router.push('/login')} />} />;
  if (mine.loading || catalog.loading) return <Loading />;
  const save = async () => {
    try {
      if (v && !modelId) await api.patch(`/me/vehicles/${v.id}`, { currentSoc: soc, targetSoc: target });
      else {
        const m = catalog.data.models.find((x: any) => x.id === modelId);
        if (!m) return;
        const body = { modelId: m.id, brand: m.brand, model: `${m.model} ${m.variant}`.trim(), batteryKwh: Number(m.battery_kwh), maxAcKw: Number(m.max_ac_kw), maxDcKw: Number(m.max_dc_kw), connectors: m.connectors, curveProfile: m.curve_profile, efficiencyWhPerKm: m.efficiency_wh_km, currentSoc: soc, targetSoc: target, isDefault: true };
        await api.post('/me/vehicles', body);
      }
      await refresh();
      router.back();
    } catch (e: any) { Alert.alert('Could not save', e.message); }
  };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}>
      {v && (
        <Card style={{ gap: 4 }}>
          <T weight="700" size={17}>{v.brand} {v.model}</T>
          <T size={13} muted>{v.battery_kwh} kWh · AC {v.max_ac_kw} kW · DC {v.max_dc_kw} kW · {v.connectors.join(', ')} · {v.efficiency_wh_km} Wh/km</T>
        </Card>
      )}
      <Card style={{ gap: 12 }}>
        <T weight="700">Battery</T>
        <Row gap={16}><SocSlider label="Current" value={soc} onChange={setSoc} color={c.warning} /><SocSlider label="Charge target" value={target} onChange={(x) => setTarget(Math.max(1, x))} /></Row>
      </Card>
      <Card style={{ gap: 10 }}>
        <T weight="700">{v ? 'Switch to another model' : 'Choose your EV'}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {catalog.data?.models.map((m: any) => <Chip key={m.id} label={`${m.brand} ${m.model}`} active={modelId === m.id} onPress={() => setModelId(modelId === m.id ? null : m.id)} />)}
        </Row>
        <T size={11.5} muted>Specs are typical values; fine-tune them in the web app profile.</T>
      </Card>
      <View><Button title="Save" onPress={save} disabled={!v && !modelId} /></View>
    </ScrollView>
  );
}
