'use client';
import { Bell } from 'lucide-react';
import { NOTIFICATION_LABELS, NOTIFICATION_TYPES } from '@wattly/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useRealtime } from '@/lib/realtime';
import { useToast } from '@/lib/toast';
import { cn, timeAgo } from '@/lib/format';
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonList, Toggle } from '@/components/ui';
import { RequireRole } from '@/components/layout/RequireRole';
import { NOTIF_ICON } from '@/components/layout/NotificationBell';

function Notifications() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useFetch<any>('/me/notifications');
  useRealtime('user', (event, n) => { if (event === 'notification' && data) setData({ ...data, notifications: [n, ...data.notifications], unread: data.unread + 1 }); });
  const prefs = me.preferences?.notification_prefs ?? {};
  const setPref = async (type: string, on: boolean) => {
    try { await api.patch('/me/preferences', { notificationPrefs: { [type]: on } }); await refresh(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <PageHeader title="Notifications" actions={data?.unread > 0 && <Button variant="outline" size="sm" onClick={async () => { await api.post('/me/notifications/read'); reload(true); }}>Mark all read</Button>} />
      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <div>
          {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data.notifications.length ? <EmptyState icon={<Bell className="size-6" />} title="Nothing yet" body="Charging updates, reservation reminders and price alerts appear here." /> : (
            <Card className="divide-y divide-border">
              {data.notifications.map((n: any) => {
                const Icon = NOTIF_ICON[n.type] ?? Bell;
                return (
                  <div key={n.id} className={cn('flex gap-3 p-4', !n.read_at && 'bg-accent-soft/30')}>
                    <span className="size-9 shrink-0 rounded-xl bg-surface-2 grid place-items-center text-muted"><Icon className="size-4" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2"><span className="text-sm font-medium">{n.title}</span><span className="text-xs text-subtle whitespace-nowrap">{timeAgo(n.created_at)}</span></div>
                      <p className="text-sm text-muted mt-0.5">{n.body}</p>
                      <span className="text-[11px] text-subtle">{NOTIFICATION_LABELS[n.type as keyof typeof NOTIFICATION_LABELS]?.label ?? n.type}</span>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader title="Preferences" subtitle="Choose what Wattly tells you about" />
          <div className="px-5 pb-5 space-y-4">
            {NOTIFICATION_TYPES.filter((t) => t !== 'system').map((t) => (
              <Toggle key={t} checked={prefs[t] !== false} onChange={(v) => setPref(t, v)} label={NOTIFICATION_LABELS[t].label} description={NOTIFICATION_LABELS[t].description} />
            ))}
            <p className="text-xs text-muted">In-app and real-time alerts are active. Push, email and SMS channels can be connected by the platform operator.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
export default function NotificationsPage() {
  return <RequireRole><Notifications /></RequireRole>;
}
