'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cn, timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, ErrorState, PageHeader, SkeletonList, Stat, Table } from '@/components/ui';

export default function DataQuality() {
  const toast = useToast();
  const dq = useFetch<any>('/admin/data-quality');
  const reports = useFetch<any>('/admin/station-reports');
  if (dq.error) return <ErrorState error={dq.error} onRetry={dq.reload} />;
  const stations = dq.data?.stations ?? [];
  return (
    <>
      <PageHeader title="Data quality" subtitle="Keep listings accurate: missing info, stale status and driver reports." />
      {dq.loading ? <SkeletonList /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat label="Average quality score" value={`${dq.data.averageScore}/100`} tone="green" />
            <Stat label="Stations with issues" value={stations.filter((s: any) => s.issues.length).length} tone="amber" />
            <Stat label="Stale manual status (>24 h)" value={stations.filter((s: any) => s.issues.some((i: string) => i.includes('24 h'))).length} tone="red" />
            <Stat label="Open driver reports" value={reports.data?.reports.filter((r: any) => !r.resolved).length ?? '…'} tone="violet" />
          </div>
          <Card className="mb-4">
            <CardHeader title="Driver reports" subtitle="Status corrections and wrong information reported from the app" />
            {reports.loading ? <SkeletonList rows={2} className="p-4" /> : (
              <Table>
                <thead><tr><th>Station</th><th>Report</th><th>Reporter</th><th>When</th><th></th></tr></thead>
                <tbody>{reports.data.reports.map((r: any) => (
                  <tr key={r.id} className={cn(r.resolved && 'opacity-50')}>
                    <td><Link href={`/stations/${r.station_id}`} className="font-medium hover:underline">{r.station_name}</Link>{r.port_label && <div className="text-xs text-muted">{r.port_label}</div>}</td>
                    <td><Badge>{r.kind.replace('_', ' ')}</Badge>{r.reported_status && <Badge tone="amber" className="ml-1">{r.reported_status}</Badge>}<div className="text-[13px] text-muted mt-1 max-w-md">{r.message}</div></td>
                    <td className="text-muted">{r.reporter}</td><td className="text-muted whitespace-nowrap">{timeAgo(r.created_at)}</td>
                    <td>{!r.resolved && <Button size="sm" variant="outline" onClick={async () => { await api.post(`/admin/station-reports/${r.id}/resolve`); toast('success', 'Marked resolved'); reports.reload(true); dq.reload(true); }}>Resolve</Button>}</td>
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Listing quality" subtitle="Lowest scores first" />
            <Table>
              <thead><tr><th>Score</th><th>Station</th><th>Company</th><th>Issues</th><th>Last status</th></tr></thead>
              <tbody>{stations.map((s: any) => (
                <tr key={s.id}>
                  <td><span className={cn('font-semibold tabular', s.score < 60 ? 'text-danger' : s.score < 85 ? 'text-warning' : 'text-accent')}>{s.score}</span></td>
                  <td><Link href={`/stations/${s.id}`} className="font-medium hover:underline">{s.name}</Link><div className="text-xs text-muted">{s.city} · {s.integration_type}</div></td>
                  <td className="text-muted">{s.company_name}</td>
                  <td><div className="flex flex-wrap gap-1">{s.issues.length ? s.issues.map((i: string) => <Badge key={i} tone="amber">{i}</Badge>) : <Badge tone="green">No issues</Badge>}</div></td>
                  <td className="text-muted whitespace-nowrap">{timeAgo(s.last_status)}</td>
                </tr>
              ))}</tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
