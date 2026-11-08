import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useColors } from '@/lib/theme';
import { Badge, Button, Card, Empty, Row, T } from '@/components/ui';

export default function Account() {
  const c = useColors();
  const { me, logout } = useAuth();
  const contrib = useFetch<any>(me.user ? '/me/contributions' : null, [me.user?.id]);
  const active = useFetch<any>(me.user ? '/sessions/active' : null, [me.user?.id]);
  if (!me.user)
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14 }}>
        <Empty icon="flash-outline" title="Welcome to Wattly Drive" body="Sign in to save your car, start charging, check in and plan EV routes." action={<Button title="Sign in or create account" onPress={() => router.push('/login')} />} />
        <T size={11} muted style={{ textAlign: 'center' }}>Server: {API_URL}</T>
      </ScrollView>
    );
  const v = me.defaultVehicle;
  const Item = ({ icon, label, href }: { icon: keyof typeof Ionicons.glyphMap; label: string; href: any }) => (
    <Pressable onPress={() => router.push(href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
      <Ionicons name={icon} size={20} color={c.muted} /><T style={{ flex: 1 }}>{label}</T><Ionicons name="chevron-forward" size={18} color={c.subtle} />
    </Pressable>
  );
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 12 }}>
      <Card>
        <Row gap={12}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><T weight="800" style={{ color: '#fff' }}>{me.user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}</T></View>
          <View style={{ flex: 1 }}><T weight="700" size={17}>{me.user.fullName}</T><T muted size={13}>{me.user.email ?? me.user.phone}</T></View>
        </Row>
      </Card>
      {active.data?.session && (
        <Card onPress={() => router.push(`/session/${active.data.session.id}`)} style={{ borderColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="battery-charging" size={26} color={c.accent} />
          <View style={{ flex: 1 }}><T weight="700">Charging now · {Math.round(Number(active.data.session.current_soc))}%</T><T size={13} muted>{active.data.session.station_name}</T></View>
          <Ionicons name="chevron-forward" size={18} color={c.subtle} />
        </Card>
      )}
      <Card onPress={() => router.push('/vehicle')} style={{ gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}><T size={12} muted weight="600">MY VEHICLE</T><T size={12} style={{ color: c.accent }}>Edit</T></Row>
        {v ? (<>
          <T weight="700" size={16}>{v.brand} {v.model}</T>
          <T size={13} muted>{v.battery_kwh} kWh · AC {v.max_ac_kw} kW · DC {v.max_dc_kw} kW · {v.connectors.join(', ')}</T>
          <T size={13}>Battery {v.current_soc}% · target {v.target_soc}%</T>
        </>) : <T muted>Add your EV for compatible chargers and accurate estimates.</T>}
      </Card>
      {contrib.data && (
        <Card style={{ gap: 10 }}>
          <T size={12} muted weight="600">COMMUNITY</T>
          <Row style={{ justifyContent: 'space-between' }}>
            {[['checkins', 'Check-ins'], ['photos', 'Photos'], ['stations', 'Added'], ['reviews', 'Reviews']].map(([k, l]) => (
              <View key={k} style={{ alignItems: 'center' }}><T weight="800" size={18}>{contrib.data.stats[k]}</T><T size={11} muted>{l}</T></View>
            ))}
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>{contrib.data.badges.filter((b: any) => b.earned).map((b: any) => <Badge key={b.id} label={`★ ${b.label}`} color={c.accent} bg={c.accentSoft} />)}</Row>
        </Card>
      )}
      <Card style={{ paddingVertical: 4 }}>
        <Item icon="time-outline" label="Charging history & invoices" href="/history" />
        <Item icon="notifications-outline" label="Notifications" href="/notifications" />
        <Item icon="add-circle-outline" label="Add a missing station" href="/add-station" />
      </Card>
      <Button title="Sign out" variant="outline" icon="log-out-outline" onPress={logout} />
      <T size={11} muted style={{ textAlign: 'center' }}>Charging companies: manage your stations in Wattly Business on the web.</T>
    </ScrollView>
  );
}
