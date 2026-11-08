'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, Building2, FileCheck2, MapPinned } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';

export default function RegisterCompany() {
  const { me, refresh, loading } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ name: '', legalName: '', registrationNumber: '', taxId: '', email: '', phone: '', website: '', address: '', country: 'PK', description: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true); setError(null);
    try { await api.post('/operator/company', f); await refresh(); router.push('/operator/settings?registered=1'); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-dvh">
      <header className="h-14 border-b border-border bg-surface flex items-center px-5"><Logo /><Link href="/" className="ml-auto text-sm text-muted">Back to app</Link></header>
      <div className="max-w-5xl mx-auto p-4 md:p-8 grid lg:grid-cols-[1fr_340px] gap-6">
        <Card className="p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Register your charging company</h1>
          <p className="text-sm text-muted mt-1">Tell us about your business. Our team verifies every operator before stations go live.</p>
          {!loading && !me.user ? (
            <div className="mt-6 rounded-xl bg-surface-2 p-4 text-sm">First <Link href="/register?type=operator" className="text-accent font-medium">create an operator account</Link> or <Link href="/login?next=/operator/register" className="text-accent font-medium">sign in</Link>.</div>
          ) : me.companies?.length ? (
            <div className="mt-6 rounded-xl bg-accent-soft p-4 text-sm">You already manage <b>{me.companies[0].name}</b>. <Link href="/operator" className="text-accent font-medium">Open dashboard →</Link></div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Brand / network name"><Input value={f.name} onChange={set('name')} required minLength={2} placeholder="e.g. BrightCharge" /></Field>
                <Field label="Legal company name"><Input value={f.legalName} onChange={set('legalName')} /></Field>
                <Field label="Registration number"><Input value={f.registrationNumber} onChange={set('registrationNumber')} /></Field>
                <Field label="Tax ID (NTN / TRN)"><Input value={f.taxId} onChange={set('taxId')} /></Field>
                <Field label="Business email"><Input type="email" value={f.email} onChange={set('email')} required /></Field>
                <Field label="Phone"><Input value={f.phone} onChange={set('phone')} required /></Field>
                <Field label="Website"><Input type="url" value={f.website} onChange={set('website')} placeholder="https://" /></Field>
                <Field label="Country"><Select value={f.country} onChange={set('country')}><option value="PK">Pakistan</option><option value="AE">United Arab Emirates</option><option value="SA">Saudi Arabia</option><option value="GB">United Kingdom</option><option value="US">United States</option></Select></Field>
              </div>
              <Field label="Registered address"><Input value={f.address} onChange={set('address')} required minLength={5} /></Field>
              <Field label="About your network (optional)"><Textarea value={f.description} onChange={set('description')} /></Field>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" loading={busy}>Submit for verification</Button>
            </form>
          )}
        </Card>
        <div className="space-y-3">
          {[[Building2, 'Register', 'Company details and a contact person.'], [FileCheck2, 'Verify', 'Upload incorporation documents. An admin reviews ownership.'], [MapPinned, 'List stations', 'Add stations, ports, prices and opening hours.'], [BadgeCheck, 'Go live', 'Approved listings appear to drivers with a verified badge.']].map(([Icon, t, d]: any, i) => (
            <Card key={t} className="p-4 flex gap-3"><div className="size-9 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0"><Icon className="size-4" /></div><div><div className="text-sm font-semibold">{i + 1}. {t}</div><div className="text-[13px] text-muted">{d}</div></div></Card>
          ))}
        </div>
      </div>
    </div>
  );
}
