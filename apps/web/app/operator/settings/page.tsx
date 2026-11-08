'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, FileText, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { dateTime } from '@/lib/format';
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';

function Settings() {
  const params = useSearchParams();
  const toast = useToast();
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useFetch<any>('/operator/company');
  const [f, setF] = useState<any>(null);
  const [docKind, setDocKind] = useState('registration');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (data) setF({ name: data.company.name, legalName: data.company.legal_name ?? '', registrationNumber: data.company.registration_number ?? '', taxId: data.company.tax_id ?? '', email: data.company.email ?? '', phone: data.company.phone ?? '', website: data.company.website ?? '', address: data.company.address ?? '', description: data.company.description ?? '', brandColor: data.company.brand_color ?? '#10b981' }); }, [data]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !f) return <Skeleton className="h-96" />;
  const c = data.company;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const upload = async (fileObj: File) => {
    const fd = new FormData();
    fd.append('kind', docKind);
    fd.append('file', fileObj);
    try { await api.post('/operator/company/documents', fd); toast('success', 'Document uploaded', 'An admin will review it.'); reload(true); } catch (e: any) { toast('error', 'Upload failed', e.message); }
  };
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Company settings" />
      {params.get('registered') && <div className="rounded-2xl bg-accent-soft p-4 text-sm"><b>Company registered.</b> Upload your incorporation certificate below to speed up verification. Meanwhile you can create stations as drafts.</div>}
      <Card>
        <CardHeader title="Verification" action={<Badge tone={c.verification_status === 'verified' ? 'green' : c.verification_status === 'pending' ? 'amber' : 'red'}>{c.verification_status === 'verified' && <BadgeCheck className="size-3" />}{c.verification_status}</Badge>} />
        <div className="px-5 pb-5 space-y-3 text-sm">
          {c.verification_status === 'verified' ? <p className="text-muted">Verified {c.verified_at ? dateTime(c.verified_at) : ''}. Your listings show a verified badge.</p> : <p className="text-muted">Wattly checks business registration and ownership before stations go live.{c.verification_notes ? ` Admin note: ${c.verification_notes}` : ''}</p>}
          <ul className="space-y-1.5">{(c.documents ?? []).map((d: any, i: number) => <li key={i} className="flex items-center gap-2"><FileText className="size-4 text-muted" />{d.name}<span className="text-xs text-muted">· {d.kind} · {dateTime(d.uploadedAt)}</span></li>)}</ul>
          <div className="flex flex-wrap gap-2 items-end">
            <Field label="Document type"><Select value={docKind} onChange={(e) => setDocKind(e.target.value)} className="w-56"><option value="registration">Certificate of incorporation</option><option value="tax">Tax registration</option><option value="site_ownership">Site lease / ownership</option><option value="utility">Utility connection approval</option></Select></Field>
            <Button variant="outline" onClick={() => file.current?.click()}><Upload className="size-4" />Upload PDF / image</Button>
            <input ref={file} type="file" className="hidden" accept="application/pdf,image/png,image/jpeg" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Company profile" subtitle="Shown to drivers on station pages and invoices." />
        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
          <Field label="Brand name"><Input value={f.name} onChange={set('name')} /></Field>
          <Field label="Legal name"><Input value={f.legalName} onChange={set('legalName')} /></Field>
          <Field label="Registration number"><Input value={f.registrationNumber} onChange={set('registrationNumber')} /></Field>
          <Field label="Tax ID"><Input value={f.taxId} onChange={set('taxId')} /></Field>
          <Field label="Email"><Input value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Website"><Input value={f.website} onChange={set('website')} /></Field>
          <Field label="Brand colour"><div className="flex gap-2"><input type="color" value={f.brandColor} onChange={set('brandColor')} className="h-10 w-12 rounded-lg border border-border bg-surface" aria-label="Brand colour" /><Input value={f.brandColor} onChange={set('brandColor')} /></div></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={set('description')} /></Field>
          <div className="sm:col-span-2"><Button loading={busy} onClick={async () => { setBusy(true); try { await api.patch('/operator/company', { ...f, website: f.website || undefined }); await refresh(); toast('success', 'Company updated'); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); } }}>Save changes</Button></div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Team" subtitle="People who can manage this network" />
        <div className="px-5 pb-5 space-y-2">
          {data.members.map((m: any) => <div key={m.id} className="flex items-center gap-3 text-sm rounded-xl border border-border p-3"><div className="size-8 rounded-full bg-surface-2 grid place-items-center text-xs font-semibold">{m.full_name.split(' ').map((p: string) => p[0]).join('').slice(0, 2)}</div><div className="flex-1"><div className="font-medium">{m.full_name}</div><div className="text-xs text-muted">{m.email}</div></div><Badge>{m.member_role}</Badge></div>)}
        </div>
      </Card>
    </div>
  );
}
export default function SettingsPage() {
  return <Suspense><Settings /></Suspense>;
}
