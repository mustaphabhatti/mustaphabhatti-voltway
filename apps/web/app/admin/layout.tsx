'use client';
import { Image as ImageIcon, BarChart3, Building2, ClipboardCheck, FileClock, Gauge, LayoutDashboard, MapPinned, MessageSquareWarning, Plug, Settings, Users, LifeBuoy } from 'lucide-react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { RequireRole } from '@/components/layout/RequireRole';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/companies', label: 'Companies', icon: Building2 },
  { href: '/admin/stations', label: 'Station listings', icon: MapPinned },
  { href: '/admin/quality', label: 'Data quality', icon: ClipboardCheck },
  { href: '/admin/reviews', label: 'Reviews', icon: MessageSquareWarning },
  { href: '/admin/photos', label: 'Community photos', icon: ImageIcon },
  { href: '/admin/complaints', label: 'Complaints', icon: LifeBuoy },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/settings', label: 'Settings & pricing rules', icon: Settings },
  { href: '/admin/audit', label: 'Audit log', icon: FileClock },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell nav={NAV} badge="Admin" footer={<div className="text-xs text-muted flex items-center gap-2"><Gauge className="size-3.5" />Platform administration</div>}><RequireRole roles={['admin']}>{children}</RequireRole></DashboardShell>;
}
