'use client';
import { useState } from 'react';
import { CheckCircle2, CircleSlash, CreditCard, KeyRound, Map, Plug, Radio, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Table } from '@/components/ui';

export default function Integrations() {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<any>('/admin/integrations');
  const { data: companies } = useFetch<any>('/admin/companies');
  const [ocpi, setOcpi] = useState<{ name: string; companyId: string; locationsUrl: string; token: string } | null>(null);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[600px]" />;
  const health = (name: string) => data.health.find((h: any) => h.name === name);
  const H = ({ name }: { name: string }) => { const h = health(name); return !h ? <Badge>not used yet</Badge> : h.ok ? <Badge tone="green"><CheckCircle2 className="size-3" />ok {timeAgo(h.lastSuccessAt)}</Badge> : <Badge tone="red" title={h.lastError}><XCircle className="size-3" />failing · {h.lastError}</Badge>; };
  return (
    <>
      <PageHeader title="Integrations & Wattly Network" subtitle="Maps, routing, traffic, charger networks, payments and sign-in providers. Secrets are configured as server environment variables." />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Map className="size-4" />Maps, routing & traffic</span>} />
          <div className="px-5 pb-5 space-y-2 text-sm">
            <Row k="Routing chain" v={<span className="font-mono text-xs">{data.maps.routingChain.join(' → ')}</span>} />
            <Row k="OSRM" v={<H name="routing:osrm" />} />
            <Row k="Mapbox Directions (live traffic)" v={data.maps.mapboxConfigured ? <H name="routing:mapbox" /> : <Badge><CircleSlash className="size-3" />MAPBOX_TOKEN not set</Badge>} />
            <Row k="Offline highway graph" v={<H name="routing:offline" />} />
            <Row k="Geocoder" v={<span>{data.maps.geocoder} <H name="geocoding:nominatim" /></span>} />
            <Row k="Traffic source" v={<Badge tone={data.maps.mapboxConfigured ? 'green' : 'amber'}>{data.maps.trafficSource}</Badge>} />
          </div>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><CreditCard className="size-4" />Payments & sign-in</span>} />
          <div className="px-5 pb-5 space-y-2 text-sm">
            <Row k="Payment provider" v={<Badge tone={data.payments.demo ? 'violet' : 'green'}>{data.payments.provider}{data.payments.demo ? ' (no money moves)' : ''}</Badge>} />
            <Row k="Google sign-in" v={data.auth.google ? <Badge tone="green">configured</Badge> : <Badge>not configured</Badge>} />
            <Row k="Sign in with Apple" v={data.auth.apple ? <Badge tone="green">configured</Badge> : <Badge>not configured</Badge>} />
            <Row k="Realtime clients" v={<Badge tone="blue"><Radio className="size-3" />{data.realtime.connectedClients} connected</Badge>} />
            <Row k="Demo simulator" v={<Badge tone={data.simulator.enabled ? 'violet' : 'neutral'}>{data.simulator.enabled ? `on · ${data.simulator.activeSessions} sessions · ×${data.simulator.speed}` : 'off'}</Badge>} />
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title={<span className="flex items-center gap-2"><Plug className="size-4" />Wattly Network · OCPP 1.6J charge points</span>} subtitle={`Endpoint ws(s)://<api-host>${data.ocpp.endpoint} · sub-protocol ${data.ocpp.protocol}`} />
        <Table>
          <thead><tr><th>Identity</th><th>Station</th><th>Hardware</th><th>Last heartbeat</th><th>Connection</th></tr></thead>
          <tbody>{data.ocpp.chargePoints.map((c: any) => <tr key={c.id}><td className="font-mono text-xs">{c.id}</td><td>{c.station_name}</td><td className="text-muted">{c.vendor ? `${c.vendor} ${c.model ?? ''}` : '—'}</td><td className="text-muted">{c.last_heartbeat_at ? timeAgo(c.last_heartbeat_at) : 'never'}</td><td><Badge tone={c.connected ? 'green' : 'neutral'}>{c.connected ? 'connected' : 'offline'}</Badge></td></tr>)}</tbody>
        </Table>
      </Card>
      <Card className="mt-4">
        <CardHeader title={<span className="flex items-center gap-2"><KeyRound className="size-4" />Wattly Network · OCPI roaming connections</span>} subtitle="Import a CPO's locations and live EVSE status (OCPI 2.2.1, eMSP pull)." action={<Button size="sm" onClick={() => setOcpi({ name: '', companyId: '', locationsUrl: '', token: '' })}>Add connection</Button>} />
        {data.integrations.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">No OCPI connections configured.</p> : (
          <Table>
            <thead><tr><th>Name</th><th>Company</th><th>Locations URL</th><th>Last sync</th><th>Status</th><th></th></tr></thead>
            <tbody>{data.integrations.map((i: any) => (
              <tr key={i.id}><td className="font-medium">{i.name}</td><td>{i.company_name}</td><td className="font-mono text-xs max-w-xs truncate">{i.config?.locationsUrl}</td><td className="text-muted">{i.last_sync_at ? timeAgo(i.last_sync_at) : 'never'}</td><td className="text-xs text-muted max-w-xs">{i.status_message ?? '—'}</td>
                <td className="whitespace-nowrap"><Button size="sm" variant="outline" onClick={async () => { try { const r = await api.post(`/admin/integrations/${i.id}/sync`); toast('success', `Imported ${r.imported} locations`); } catch (e: any) { toast('error', e.message); } reload(true); }}><RefreshCw className="size-3.5" />Sync</Button>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await api.del(`/admin/integrations/${i.id}`); reload(true); }}><Trash2 className="size-4" /></Button></td></tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <Modal open={!!ocpi} onClose={() => setOcpi(null)} title="Add OCPI connection" footer={<><Button variant="ghost" onClick={() => setOcpi(null)}>Cancel</Button><Button disabled={!ocpi?.name || !ocpi?.companyId || !ocpi?.locationsUrl || !ocpi?.token} onClick={async () => { try { await api.post('/admin/integrations', { kind: 'ocpi', name: ocpi!.name, companyId: ocpi!.companyId, config: { locationsUrl: ocpi!.locationsUrl, token: ocpi!.token } }); toast('success', 'Connection added'); setOcpi(null); reload(true); } catch (e: any) { toast('error', e.message); } }}>Save</Button></>}>
        {ocpi && <div className="space-y-3">
          <Field label="Name"><Input value={ocpi.name} onChange={(e) => setOcpi({ ...ocpi, name: e.target.value })} /></Field>
          <Field label="Assign imported stations to"><Select value={ocpi.companyId} onChange={(e) => setOcpi({ ...ocpi, companyId: e.target.value })}><option value="">Choose company</option>{companies?.companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Locations endpoint URL"><Input value={ocpi.locationsUrl} onChange={(e) => setOcpi({ ...ocpi, locationsUrl: e.target.value })} placeholder="https://cpo.example/ocpi/2.2.1/locations" /></Field>
          <Field label="Token (Token C)" hint="Stored server-side and never returned to the browser."><Input type="password" value={ocpi.token} onChange={(e) => setOcpi({ ...ocpi, token: e.target.value })} /></Field>
          <p className="text-xs text-muted">Imported stations arrive as pending listings for review.</p>
        </div>}
      </Modal>
    </>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) { return <div className="flex items-center justify-between gap-3 py-1 border-b border-border/60 last:border-0"><span className="text-muted">{k}</span>{v}</div>; }
