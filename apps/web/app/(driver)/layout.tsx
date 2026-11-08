import { DriverShell } from '@/components/layout/DriverShell';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <DriverShell>{children}</DriverShell>;
}
