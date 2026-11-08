'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounced, useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { Badge, Card, ErrorState, Input, PageHeader, Select, SkeletonList, Table } from '@/components/ui';
import { qs } from '@/lib/api';

export default function AdminUsers() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch<any>(`/admin/users${qs({ q: dq, role, status })}`);
  const update = async (id: string, patch: any) => { try { await api.patch(`/admin/users/${id}`, patch); toast('success', 'User updated'); reload(true); } catch (e: any) { toast('error', e.message); } };
  return (
    <>
      <PageHeader title="Users" subtitle="Drivers, operators and administrators" />
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative w-full sm:w-80"><Search className="size-4 absolute left-3 top-3 text-subtle" /><Input className="pl-9" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-40" aria-label="Role"><option value="">All roles</option><option value="driver">Drivers</option><option value="operator">Operators</option><option value="admin">Admins</option></Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : (
        <Card>
          <Table>
            <thead><tr><th>User</th><th>Role</th><th>Company</th><th>Sign-in</th><th>Sessions</th><th>Joined</th><th>Last login</th><th>Status</th></tr></thead>
            <tbody>{data.users.map((u: any) => (
              <tr key={u.id}>
                <td><div className="font-medium">{u.full_name}</div><div className="text-xs text-muted">{u.email ?? u.phone}</div></td>
                <td><Select className="h-8 w-28 text-xs" value={u.role} onChange={(e) => update(u.id, { role: e.target.value })} aria-label="Role"><option value="driver">driver</option><option value="operator">operator</option><option value="admin">admin</option></Select></td>
                <td className="text-muted">{u.companies ?? '—'}</td>
                <td><Badge>{u.auth_provider}</Badge></td>
                <td className="tabular">{u.sessions}</td>
                <td className="text-muted whitespace-nowrap">{timeAgo(u.created_at)}</td>
                <td className="text-muted whitespace-nowrap">{u.last_login_at ? timeAgo(u.last_login_at) : 'never'}</td>
                <td>{u.status === 'active' ? <button onClick={() => confirm(`Suspend ${u.full_name}?`) && update(u.id, { status: 'suspended' })}><Badge tone="green">active</Badge></button> : <button onClick={() => update(u.id, { status: 'active' })}><Badge tone="red">suspended</Badge></button>}</td>
              </tr>
            ))}</tbody>
          </Table>
          <p className="text-xs text-muted px-5 py-3 border-t border-border">Click a status to suspend or reactivate. Suspended users are signed out of the API immediately.</p>
        </Card>
      )}
    </>
  );
}
