'use client';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { PlatformProvider } from '@/lib/platform';
import { RealtimeProvider } from '@/lib/realtime';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/lib/toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <PlatformProvider>
          <AuthProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
          </AuthProvider>
        </PlatformProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
