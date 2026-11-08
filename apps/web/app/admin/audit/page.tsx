'use client';
import { useFetch } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { Card, ErrorState, PageHeader, SkeletonList, Table } from '@/components/ui';

export default function AuditLog() {
  const { data, error, loading, reload } = useFetch<any>('/admin/audit-log');
  return (
    <>
      <PageHeader title="Audit log" subtitle="Administrative and operator actions (latest 200)" />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : (
        <Card>
          <Table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{data.entries.map((e: any) => (
              <tr key={e.id}><td className="whitespace-nowrap text-muted">{dateTime(e.created_at)}</td><td>{e.actor_name ?? 'system'}<div className="text-xs text-muted">{e.actor_email}</div></td><td className="font-mono text-xs">{e.action}</td><td className="text-xs">{e.entity}<div className="text-muted font-mono">{e.entity_id?.slice(0, 8)}</div></td><td className="font-mono text-[11px] text-muted max-w-md truncate">{JSON.stringify(e.details)}</td></tr>
            ))}</tbody>
          </Table>
          {!data.entries.length && <p className="p-5 text-sm text-muted">No actions recorded yet.</p>}
        </Card>
      )}
    </>
  );
}
