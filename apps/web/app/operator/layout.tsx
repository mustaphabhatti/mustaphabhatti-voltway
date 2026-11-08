'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Building2, CalendarClock, CircleDollarSign, LayoutDashboard, MapPinned, MessageSquare, PlugZap, Settings } from 'lucide-react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { RequireRole } from '@/components/layout/RequireRole';
import { useAuth } from '@/lib/auth';
import { Badge, Button, EmptyState } from '@/components/ui';

const NAV = [
  { href: '/operator', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/operator/stations', label: 'Stations', icon: MapPinned },
  { href: '/operator/ports', label: 'Charging Ports', icon: PlugZap },
  { href: '/operator/pricing', label: 'Pricing', icon: CircleDollarSign },
  { href: '/operator/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/operator/reservations', label: 'Reservations', icon: CalendarClock },
  { href: '/operator/reviews', label: 'Reviews', icon: MessageSquare },
  { href: '/operator/settings', label: 'Settings', icon: Settings },
];

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me } = useAuth();
  const company = me.companies?.[0];
  if (path === '/operator/register') return <>{children}</>;
  return (
    <DashboardShell nav={NAV} badge="Business"
      header={company && (
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-[13px] font-semibold truncate flex items-center gap-1.5"><Building2 className="size-3.5" />{company.name}</div>
          <Badge tone={company.verification_status === 'verified' ? 'green' : company.verification_status === 'pending' ? 'amber' : 'red'} className="mt-1.5">{company.verification_status === 'verified' ? 'Verified operator' : company.verification_status === 'pending' ? 'Verification pending' : `Verification ${company.verification_status}`}</Badge>
        </div>
      )}>
      <RequireRole roles={['operator', 'admin']} fallback={<EmptyState icon={<Building2 className="size-6" />} title="Run charging stations?" body="Join Wattly Business to list your stations on Wattly Network, set prices and see analytics." action={<Link href="/operator/register"><Button>Register your company</Button></Link>} />}>
        {me.user?.role === 'operator' && !company ? (
          <EmptyState icon={<Building2 className="size-6" />} title="Register your company" body="Add your business details to start managing stations." action={<Link href="/operator/register"><Button>Register company</Button></Link>} />
        ) : me.user?.role === 'admin' && !company ? (
          <EmptyState icon={<Building2 className="size-6" />} title="Admins manage companies from the admin panel" body="Open a company from Admin → Companies, or use an operator account." action={<Link href="/admin/companies"><Button>Go to companies</Button></Link>} />
        ) : children}
      </RequireRole>
    </DashboardShell>
  );
}
