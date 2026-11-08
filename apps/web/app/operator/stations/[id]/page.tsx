'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, ImagePlus, Plug, Plus, Save, Send, Trash2, Wrench, X } from 'lucide-react';
import { PORT_STATUSES, PORT_STATUS_LABELS, CONNECTOR_LABELS } from '@voltway/shared';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import type { Station } from '@/lib/types';
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, PageHeader, Segmented, Select, Skeleton, Textarea, Toggle } from '@/components/ui';
import { OperationalBadge, PortStatusBadge, SourceBadge } from '@/components/station/badges';
import { PortFields, StationForm, draftToPayload, stationToDraft, type PortDraft, type StationDraft } from '@/components/operator/StationForm';
import { LISTING_TONE } from '@/components/operator/constants';

export default function EditStation() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ station: Station; chargePoints: any[] }>(`/operator/stations/${id}`);
  const [tab, setTab] = useState<'details' | 'ports' | 'photos' | 'integration'>('details');
  const [draft, setDraft] = useState<StationDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [maint, setMaint] = useState<{ open: boolean; note: string }>({ open: false, note: '' });
  useEffect(() => { if (data && !draft) setDraft(stationToDraft(data.station)); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data || !draft) return <Skeleton className="h-[600px]" />;
  const s = data.station;

  const save = async () => {
    setSaving(true);
    try {
      const { ports: _p, ...payload } = draftToPayload(draft);
      void _p;
      const r = await api.patch(`/operator/stations/${id}`, payload);
      toast('success', 'Station saved', r.reReviewRequired ? 'The location changed significantly, so the listing goes back to review.' : undefined);
      reload(true);
    } catch (e: any) { toast('error', 'Could not save', e.message); } finally { setSaving(false); }
  };
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast('success', ok); reload(true); } catch (e: any) { toast('error', e.message); } };

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3 flex-wrap">{s.name}<Badge tone={LISTING_TONE[s.listingStatus]}>{s.listingStatus === 'approved' ? 'live' : s.listingStatus}</Badge></span>}
        subtitle={`${s.address}, ${s.city} · updated ${timeAgo(s.infoUpdatedAt)}`}
        actions={<>
          <Link href={`/stations/${s.id}`} target="_blank"><Button variant="outline"><ExternalLink className="size-4" />Driver view</Button></Link>
          {(s.listingStatus === 'draft' || s.listingStatus === 'rejected') && <Button variant="electric" onClick={() => act(() => api.post(`/operator/stations/${id}/submit`), 'Submitted for review')}><Send className="size-4" />Submit for review</Button>}
          {s.maintenanceMode ? <Button variant="outline" onClick={() => act(() => api.post(`/operator/stations/${id}/maintenance`, { enabled: false }), 'Maintenance ended')}><Wrench className="size-4" />End maintenance</Button>
            : <Button variant="outline" onClick={() => setMaint({ open: true, note: '' })}><Wrench className="size-4" />Maintenance</Button>}
          <Button variant="ghost" className="text-danger" onClick={async () => { if (confirm(`Delete ${s.name}? This removes its ports, history and reviews.`)) { try { await api.del(`/operator/stations/${id}`); toast('success', 'Station deleted'); router.push('/operator/stations'); } catch (e: any) { toast('error', e.message); } } }}><Trash2 className="size-4" /></Button>
        </>}
      />
      {s.listingStatus === 'rejected' && s.rejectionReason && <div className="rounded-2xl bg-danger-soft text-danger p-4 mb-4 text-sm"><b>Listing rejected:</b> {s.rejectionReason} Fix the details and submit again.</div>}
      {s.listingStatus === 'pending' && <div className="rounded-2xl bg-warning-soft p-4 mb-4 text-sm">This listing is waiting for Voltway review. It isn&apos;t visible to drivers yet.</div>}
      {s.maintenanceMode && <div className="rounded-2xl bg-violet-soft text-violet p-4 mb-4 text-sm"><b>Maintenance mode is on.</b> {s.maintenanceNote} Ports show as out of service and favorites were notified.</div>}

      <Segmented value={tab} onChange={setTab} className="mb-4" options={[{ value: 'details', label: 'Details' }, { value: 'ports', label: `Ports (${s.ports.length})` }, { value: 'photos', label: `Photos (${s.images.length})` }, { value: 'integration', label: 'Data connection' }]} />

      {tab === 'details' && (
        <div className="max-w-5xl">
          <StationForm value={draft} onChange={setDraft} />
          <div className="flex justify-end mt-4 sticky bottom-4"><Button size="lg" onClick={save} loading={saving} className="shadow-pop"><Save className="size-4" />Save changes</Button></div>
        </div>
      )}
      {tab === 'ports' && <PortsTab station={s} onChange={() => reload(true)} />}
      {tab === 'photos' && <PhotosTab station={s} onChange={() => reload(true)} />}
      {tab === 'integration' && <IntegrationTab station={s} chargePoints={data.chargePoints} onChange={() => reload(true)} />}

      <Modal open={maint.open} onClose={() => setMaint({ open: false, note: '' })} title="Start maintenance"
        footer={<><Button variant="ghost" onClick={() => setMaint({ open: false, note: '' })}>Cancel</Button><Button onClick={() => { act(() => api.post(`/operator/stations/${id}/maintenance`, { enabled: true, note: maint.note || undefined }), 'Maintenance mode on'); setMaint({ open: false, note: '' }); }}>Start maintenance</Button></>}>
        <p className="text-sm text-muted mb-3">All ports are marked out of service and drivers who saved this station are notified.</p>
        <Field label="Note for drivers"><Textarea value={maint.note} onChange={(e) => setMaint({ ...maint, note: e.target.value })} placeholder="e.g. Cabinet replacement, back by 18:00" /></Field>
      </Modal>
    </>
  );
}

function PortsTab({ station: s, onChange }: { station: Station; onChange: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PortDraft | null>(null);
  const [adding, setAdding] = useState<PortDraft | null>(null);
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast('success', ok); onChange(); } catch (e: any) { toast('error', e.message); } };
  return (
    <Card>
      <CardHeader title="Charging ports" subtitle={s.integration.type === 'ocpp' ? 'Status is reported live over OCPP. You can still take a port out of service.' : 'Update status manually whenever a port changes state; drivers see when it was last reported.'}
        action={<Button size="sm" onClick={() => setAdding({ label: `P-${s.ports.length + 1}`, connectorType: 'CCS2', maxPowerKw: 60, voltage: 750, amperage: 150 })}><Plus className="size-4" />Add port</Button>} />
      <div className="px-5 pb-5 space-y-2">
        {adding && (
          <div className="rounded-xl border border-accent/40 p-2 space-y-2">
            <PortFields p={adding} onChange={setAdding} onRemove={() => setAdding(null)} />
            <div className="flex justify-end"><Button size="sm" onClick={() => run(async () => { await api.post(`/operator/stations/${s.id}/ports`, adding); setAdding(null); }, 'Port added')}>Save port</Button></div>
          </div>
        )}
        {s.ports.map((p) => editing === p.id && draft ? (
          <div key={p.id} className="rounded-xl border border-electric/40 p-2 space-y-2">
            <PortFields p={draft} onChange={setDraft} />
            <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={() => run(async () => { await api.patch(`/operator/ports/${p.id}`, draft); setEditing(null); }, 'Port updated')}>Save</Button></div>
          </div>
        ) : (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
            <div className="min-w-40 flex-1">
              <div className="font-medium text-sm">{p.label} <span className="text-muted font-normal">· {CONNECTOR_LABELS[p.connectorType]} · {p.maxPowerKw} kW {p.currentType}</span></div>
              <div className="text-xs text-muted">{p.voltage ? `${p.voltage} V` : ''}{p.amperage ? ` · ${p.amperage} A` : ''}{p.powerGroup ? ` · group ${p.powerGroup}` : ''}{p.evseUid ? ` · ${p.evseUid}` : ''}</div>
            </div>
            <div className="flex flex-col items-end gap-1"><PortStatusBadge status={p.status} /><SourceBadge source={p.statusSource} updatedAt={p.statusUpdatedAt} stale={p.statusStale} compact /></div>
            <Select className="w-48 h-9" value="" aria-label="Set status" onChange={(e) => e.target.value && run(() => api.post(`/operator/ports/${p.id}/status`, { status: e.target.value }), 'Status updated')}>
              <option value="">Set status…</option>
              {PORT_STATUSES.map((st) => <option key={st} value={st}>{PORT_STATUS_LABELS[st]}</option>)}
            </Select>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(p.id); setDraft({ label: p.label, connectorType: p.connectorType, maxPowerKw: p.maxPowerKw, voltage: p.voltage, amperage: p.amperage, powerGroup: p.powerGroup }); }}>Edit</Button>
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm(`Delete ${p.label}?`) && run(() => api.del(`/operator/ports/${p.id}`), 'Port deleted')}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PhotosTab({ station: s, onChange }: { station: Station; onChange: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try { await api.post(`/operator/stations/${s.id}/images`, fd); toast('success', 'Photo uploaded'); onChange(); } catch (e: any) { toast('error', 'Upload failed', e.message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title="Station photos" subtitle="Clear photos of the entrance and chargers help drivers find the bays." action={<Button size="sm" loading={busy} onClick={() => input.current?.click()}><ImagePlus className="size-4" />Upload</Button>} />
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <div className="px-5 pb-5">
        {!s.images.length ? <button onClick={() => input.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-border py-12 text-sm text-muted hover:bg-surface-2">Drop a JPG, PNG or WebP (max 8 MB) or click to upload</button> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {s.images.map((url) => (
              <div key={url} className="relative group rounded-xl overflow-hidden aspect-[4/3] bg-surface-2">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button onClick={async () => { await api.del(`/operator/stations/${s.id}/images`, { url }); onChange(); }} className="absolute top-2 right-2 size-7 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100" aria-label="Remove photo"><X className="size-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function IntegrationTab({ station: s, chargePoints, onChange }: { station: Station; chargePoints: any[]; onChange: () => void }) {
  const toast = useToast();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [usePw, setUsePw] = useState(true);
  const [created, setCreated] = useState<any>(null);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader title="OCPP 1.6J chargers" subtitle="Point your charger's central system URL at Voltway to report live status and accept remote start/stop." />
        <div className="px-5 pb-5 space-y-3">
          {chargePoints.length === 0 && <p className="text-sm text-muted">No chargers registered.</p>}
          {chargePoints.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <Plug className="size-4 text-muted" />
              <div className="flex-1 min-w-0"><div className="font-mono text-sm">{c.id}</div><div className="text-xs text-muted">{c.vendor ? `${c.vendor} ${c.model ?? ''} · fw ${c.firmware ?? '?'}` : 'Never connected'}{c.last_heartbeat_at ? ` · heartbeat ${timeAgo(c.last_heartbeat_at)}` : ''}</div></div>
              <Badge tone={c.connected ? 'green' : 'neutral'}>{c.connected ? 'Connected' : 'Offline'}</Badge>
              <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await api.del(`/operator/charge-points/${c.id}`); onChange(); }}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <div className="rounded-xl bg-surface-2 p-3 space-y-3">
            <div className="text-[13px] font-semibold">Register a charger</div>
            <Field label="Charge point identity" hint="Must match the identity configured on the charger."><Input value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="e.g. BRIGHT-MALL-01" /></Field>
            <Toggle checked={usePw} onChange={setUsePw} label="Require HTTP Basic auth (security profile 1)" />
            {usePw && <Field label="Password (12+ characters)"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
            <Button size="sm" disabled={identity.length < 3 || (usePw && password.length < 12)} onClick={async () => { try { const r = await api.post(`/operator/stations/${s.id}/charge-points`, { identity, password: usePw ? password : undefined }); setCreated(r.chargePoint); setIdentity(''); setPassword(''); onChange(); } catch (e: any) { toast('error', e.message); } }}>Register</Button>
            {created && (
              <div className="rounded-lg bg-surface p-3 text-[13px] space-y-1">
                <div className="font-medium">Configure the charger with:</div>
                <div className="flex items-center gap-2"><code className="font-mono text-xs break-all flex-1">{created.url}</code><button onClick={() => navigator.clipboard.writeText(created.url)} aria-label="Copy URL"><Copy className="size-3.5" /></button></div>
                <div className="text-muted">Sub-protocol <code>ocpp1.6</code>{created.basicAuth ? ' · Basic auth with the password you set' : ''}</div>
              </div>
            )}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Current data source" />
        <div className="px-5 pb-5 space-y-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-muted">Mode</span><Badge>{s.integration.type === 'none' ? 'Manual updates' : s.integration.type === 'ocpp' ? 'OCPP (live)' : s.integration.type === 'simulator' ? 'Demo simulator' : s.integration.type}</Badge></div>
          <div className="flex items-center justify-between"><span className="text-muted">Station status</span><OperationalBadge status={s.status.operational} /></div>
          <div className="flex items-center justify-between"><span className="text-muted">Shown to drivers as</span><SourceBadge source={s.status.source} updatedAt={s.status.updatedAt} stale={s.status.stale} /></div>
          <div className="flex items-center justify-between"><span className="text-muted">Remote start/stop</span><span>{s.integration.supportsRemoteStart ? 'Supported' : 'Not available'}</span></div>
          <p className="text-xs text-muted pt-2">Voltway never shows manual or simulated data as live. OCPI roaming connections are configured by the platform team (Admin → Integrations).</p>
        </div>
      </Card>
    </div>
  );
}
