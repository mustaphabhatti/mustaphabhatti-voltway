'use client';
import { useFetch } from '@/lib/hooks';
import { Button } from '@/components/ui';

export function SocialButtons({ next = '/' }: { next?: string }) {
  const { data } = useFetch<{ google: boolean; apple: boolean }>('/auth/providers');
  const go = (p: string) => (window.location.href = `/api/auth/oauth/${p}/start?next=${encodeURIComponent(next)}`);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" type="button" disabled={!data?.google} onClick={() => go('google')} title={data?.google ? undefined : 'Google sign-in is not configured on this server'}>
        <svg viewBox="0 0 24 24" className="size-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
        Google
      </Button>
      <Button variant="outline" type="button" disabled={!data?.apple} onClick={() => go('apple')} title={data?.apple ? undefined : 'Sign in with Apple is not configured on this server'}>
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor"><path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76A4.27 4.27 0 0 0 5.24 9.8c-1.54 2.67-.39 6.62 1.1 8.79.74 1.06 1.61 2.25 2.75 2.2 1.1-.04 1.52-.71 2.86-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.66-2.14a9.5 9.5 0 0 0 1.21-2.48 3.85 3.85 0 0 1-2.33-3.55zM14.17 6.13A3.9 3.9 0 0 0 15.1 3.3a4 4 0 0 0-2.6 1.34 3.7 3.7 0 0 0-.95 2.73c.98.08 1.99-.5 2.62-1.24z"/></svg>
        Apple
      </Button>
    </div>
  );
}
