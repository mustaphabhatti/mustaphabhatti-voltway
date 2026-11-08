'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, EmptyState, Spinner } from '@/components/ui';

/** Client-side guard for nicer UX. The API enforces authorization on every request. */
export function RequireRole({ roles, children, fallback }: { roles?: ('driver' | 'operator' | 'admin')[]; children: ReactNode; fallback?: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!me.user)
    return (
      <EmptyState icon={<Lock className="size-6" />} title="Sign in to continue" body="This page needs an account."
        action={<Link href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}><Button>Sign in</Button></Link>} />
    );
  if (roles && !roles.includes(me.user.role))
    return <>{fallback ?? <EmptyState icon={<Lock className="size-6" />} title="Not available for your account" body="You don't have access to this area." action={<Link href="/"><Button variant="outline">Back to map</Button></Link>} />}</>;
  return <>{children}</>;
}
