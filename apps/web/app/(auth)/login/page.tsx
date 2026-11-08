'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, Field, Input } from '@/components/ui';
import { SocialButtons } from '../SocialButtons';

const DEMO = [
  { label: 'Driver', id: 'driver@voltway.demo' },
  { label: 'Operator', id: 'ops@voltgrid.demo' },
  { label: 'Admin', id: 'admin@voltway.demo' },
];

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(params.get('error') === 'oauth' ? 'Social sign-in failed. Please try again.' : null);
  const [loading, setLoading] = useState(false);
  const submit = async (id = identifier, pw = password) => {
    setLoading(true);
    setError(null);
    try {
      await login(id, pw);
      const me = await fetch('/api/auth/me').then((r) => r.json());
      router.push(next || (me.user?.role === 'admin' ? '/admin' : me.user?.role === 'operator' ? '/operator' : '/'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-sm text-muted mt-1">Sign in with your email or phone number.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Email or phone"><Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or +92…" required /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading}>Sign in</Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-subtle"><div className="h-px bg-border flex-1" />or continue with<div className="h-px bg-border flex-1" /></div>
      <SocialButtons next={next || '/'} />
      <p className="text-sm text-muted mt-6 text-center">New to Voltway? <Link href="/register" className="text-accent font-medium">Create an account</Link></p>
      <div className="mt-8 rounded-2xl border border-dashed border-border p-4">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide">Demo accounts</div>
        <p className="text-xs text-muted mt-1">Password for all: <code className="font-mono">Demo1234!</code></p>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {DEMO.map((d) => <Button key={d.id} variant="secondary" size="sm" onClick={() => { setIdentifier(d.id); setPassword('Demo1234!'); submit(d.id, 'Demo1234!'); }}>{d.label}</Button>)}
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
