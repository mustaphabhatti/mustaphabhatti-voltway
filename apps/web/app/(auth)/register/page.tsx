'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Car, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/format';
import { Button, Field, Input, Segmented } from '@/components/ui';
import { SocialButtons } from '../SocialButtons';

function RegisterForm() {
  const { refresh } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<'driver' | 'operator'>(params.get('type') === 'operator' ? 'operator' : 'driver');
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/register', { fullName: form.fullName, password: form.password, accountType: type, ...(method === 'email' ? { email: form.email } : { phone: form.phone }) });
      await refresh();
      router.push(type === 'operator' ? '/operator/register' : '/profile?welcome=1');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="text-sm text-muted mt-1">Free for drivers. Operators can list stations after verification.</p>
      <div className="grid grid-cols-2 gap-2 mt-6">
        {([['driver', 'I drive an EV · Wattly Drive', Car], ['operator', 'I run chargers · Wattly Business', Building2]] as const).map(([v, l, Icon]) => (
          <button key={v} type="button" onClick={() => setType(v)} className={cn('rounded-2xl border p-3 text-left transition', type === v ? 'border-accent ring-4 ring-[var(--ring)]' : 'border-border hover:bg-surface-2')}>
            <Icon className={cn('size-5', type === v ? 'text-accent' : 'text-muted')} />
            <div className="text-sm font-medium mt-2">{l}</div>
          </button>
        ))}
      </div>
      <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Full name"><Input value={form.fullName} onChange={set('fullName')} autoComplete="name" required minLength={2} /></Field>
        <div>
          <Segmented value={method} onChange={setMethod} size="sm" options={[{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }]} className="mb-2" />
          {method === 'email' ? <Input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" required aria-label="Email" />
            : <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+923001234567" autoComplete="tel" required aria-label="Phone number" />}
        </div>
        <Field label="Password" hint="At least 8 characters"><Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={8} /></Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading}>Create account</Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-subtle"><div className="h-px bg-border flex-1" />or<div className="h-px bg-border flex-1" /></div>
      <SocialButtons next={type === 'operator' ? '/operator/register' : '/profile'} />
      <p className="text-sm text-muted mt-6 text-center">Already have an account? <Link href="/login" className="text-accent font-medium">Sign in</Link></p>
    </>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}
