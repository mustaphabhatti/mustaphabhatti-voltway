import { FlatList, RefreshControl } from 'react-native';
import { NOTIFICATION_LABELS, NOTIFICATION_TYPES } from '@voltway/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useRealtime } from '@/lib/realtime';
import { timeAgo } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { Button, Card, Empty, Loading, Row, T } from '@/components/ui';
import { Switch, View } from 'react-native';

export default function Notifications() {
  const c = useColors();
  const { me, refresh } = useAuth();
  const { data, loading, reload, setData } = useFetch<any>('/me/notifications');
  useRealtime('user', (event, n) => { if (event === 'notification' && data) setData({ ...data, notifications: [n, ...data.notifications] }); });
  const prefs = me.preferences?.notification_prefs ?? {};
  return (
    <FlatList style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 8 }} data={data?.notifications ?? []} keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => reload()} />}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 8 }}>
          {data?.unread > 0 && <Button title="Mark all read" variant="outline" small onPress={async () => { await api.post('/me/notifications/read'); reload(true); }} />}
          <Card style={{ gap: 10 }}>
            <T weight="700">Alert preferences</T>
            {NOTIFICATION_TYPES.filter((t) => t !== 'system').map((t) => (
              <Row key={t} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}><T size={14}>{NOTIFICATION_LABELS[t].label}</T><T size={11.5} muted>{NOTIFICATION_LABELS[t].description}</T></View>
                <Switch value={prefs[t] !== false} trackColor={{ true: c.accent }} onValueChange={async (v) => { await api.patch('/me/preferences', { notificationPrefs: { [t]: v } }); refresh(); }} />
              </Row>
            ))}
          </Card>
        </View>
      }
      ListEmptyComponent={loading ? <Loading /> : <Empty icon="notifications-outline" title="You're all caught up" />}
      renderItem={({ item: n }) => (
        <Card style={{ gap: 2, borderColor: n.read_at ? c.border : c.accent }}>
          <Row style={{ justifyContent: 'space-between' }}><T weight="700" size={14} style={{ flex: 1 }}>{n.title}</T><T size={11} muted>{timeAgo(n.created_at)}</T></Row>
          <T size={13.5} muted>{n.body}</T>
        </Card>
      )} />
  );
}
