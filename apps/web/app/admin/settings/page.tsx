'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Skeleton, Toggle } from '@/components/ui';

export default function AdminSettings() {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<any>('/admin/settings');
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !s) return <Skeleton className="h-96" />;
  const save = async (key: string) => { try { await api.put(`/admin/settings/${key}`, s[key]); toast('success', 'Settings saved'); reload(true); } catch (e: any) { toast('error', e.message); } };
  const upd = (key: string, patch: any) => setS({ ...s, [key]: { ...s[key], ...patch } });
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Platform settings" />
      <Card>
        <CardHeader title="General" />
        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
          <Field label="Platform name"><Input value={s.platform.name} onChange={(e) => upd('platform', { name: e.target.value })} /></Field>
          <Field label="Support email"><Input value={s.platform.supportEmail} onChange={(e) => upd('platform', { supportEmail: e.target.value })} /></Field>
          <Field label="Default city"><Input value={s.platform.defaultCity} onChange={(e) => upd('platform', { defaultCity: e.target.value })} /></Field>
          <Field label="Maintenance banner" hint="Shown at the top of every page when set."><Input value={s.platform.maintenanceBanner} onChange={(e) => upd('platform', { maintenanceBanner: e.target.value })} /></Field>
          <div><Button onClick={() => save('platform')}>Save general</Button></div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Pricing rules" subtitle="Platform-wide guardrails for operator tariffs" />
        <div className="px-5 pb-5 grid sm:grid-cols-3 gap-4">
          <Field label="Platform fee %" hint="Applied when settlement with operators is enabled."><Input type="number" min={0} max={30} value={s.pricing_rules.platformFeePercent} onChange={(e) => upd('pricing_rules', { platformFeePercent: Number(e.target.value) })} /></Field>
          <Field label="Max price / kWh (PKR)"><Input type="number" value={s.pricing_rules.maxPricePerKwh?.PKR ?? ''} onChange={(e) => upd('pricing_rules', { maxPricePerKwh: { ...s.pricing_rules.maxPricePerKwh, PKR: Number(e.target.value) } })} /></Field>
          <Field label="Max price / kWh (AED)"><Input type="number" step="0.01" value={s.pricing_rules.maxPricePerKwh?.AED ?? ''} onChange={(e) => upd('pricing_rules', { maxPricePerKwh: { ...s.pricing_rules.maxPricePerKwh, AED: Number(e.target.value) } })} /></Field>
          <div className="sm:col-span-3"><Toggle checked={s.pricing_rules.requireTimeOfUseDisclosure} onChange={(v) => upd('pricing_rules', { requireTimeOfUseDisclosure: v })} label="Require full time-of-use disclosure on station pages" /></div>
          <div><Button onClick={() => save('pricing_rules')}>Save pricing rules</Button></div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Notifications" />
        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
          <Field label="Reservation reminder (minutes before)"><Input type="number" min={5} max={120} value={s.notifications.reservationReminderMinutes} onChange={(e) => upd('notifications', { reservationReminderMinutes: Number(e.target.value) })} /></Field>
          <Field label="Peak pricing warning (minutes before)"><Input type="number" min={5} max={180} value={s.notifications.peakWarningMinutes} onChange={(e) => upd('notifications', { peakWarningMinutes: Number(e.target.value) })} /></Field>
          <div><Button onClick={() => save('notifications')}>Save notifications</Button></div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Demo mode" />
        <div className="px-5 pb-5 space-y-3">
          <Toggle checked={s.demo.showDemoBanner} onChange={(v) => upd('demo', { showDemoBanner: v })} label="Show the demo data banner" description="Shown while any demo listing exists. Simulated availability is always labelled, regardless of this setting." />
          <Button onClick={() => save('demo')}>Save demo settings</Button>
        </div>
      </Card>
    </div>
  );
}
