'use client';
import { useState } from 'react';
import { useFetch } from '@/lib/hooks';
import { ErrorState, PageHeader, Segmented, Select, Skeleton } from '@/components/ui';
import { AnalyticsDashboard } from '@/components/charts';

export default function AdminAnalytics() {
  const [days, setDays] = useState('30');
  const [companyId, setCompanyId] = useState('');
  const { data: companies } = useFetch<any>('/admin/companies?status=verified');
  const from = new Date(Date.now() - Number(days) * 86400_000).toISOString();
  const { data, error, loading, reload } = useFetch<any>(`/admin/analytics?from=${from}${companyId ? `&companyId=${companyId}` : ''}`, [days]);
  return (
    <>
      <PageHeader title="Platform analytics" subtitle="Revenue is shown per currency; utilization is port-hours in use over port-hours available." />
      <div className="flex flex-wrap gap-3 mb-5">
        <Segmented value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-64" aria-label="Company"><option value="">All companies</option>{companies?.companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-[600px]" /> : <div className={loading ? 'opacity-60' : ''}><AnalyticsDashboard data={data} /></div>}
    </>
  );
}
