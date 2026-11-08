'use client';
import { useParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { formatMoney } from '@voltway/shared';
import { useFetch } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { RequireRole } from '@/components/layout/RequireRole';
import { Logo } from '@/components/layout/Logo';

function Invoice() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useFetch<any>(`/me/invoices/${id}`);
  if (error) return <ErrorState error={error} onRetry={reload} className="py-24" />;
  if (loading) return <div className="max-w-2xl mx-auto p-6"><Skeleton className="h-[500px]" /></div>;
  const i = data.invoice;
  const b = i.breakdown ?? {};
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="flex justify-end mb-3 no-print"><Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print / save PDF</Button></div>
      <Card className="p-8">
        <div className="flex justify-between items-start">
          <Logo />
          <div className="text-right"><div className="text-xl font-semibold">Invoice</div><div className="text-sm text-muted font-mono">{i.number}</div><div className="text-sm text-muted">{dateTime(i.issued_at)}</div></div>
        </div>
        {b.demo && <div className="mt-4 rounded-lg bg-violet-soft text-violet text-xs p-2">Demo invoice — processed by the demo payment provider. No money was charged.</div>}
        <div className="grid grid-cols-2 gap-6 mt-8 text-sm">
          <div><div className="text-xs uppercase tracking-wide text-muted mb-1">Billed to</div><div className="font-medium">{i.full_name}</div><div className="text-muted">{i.email}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-muted mb-1">Charging operator</div><div className="font-medium">{i.company_name}</div>{i.company_tax_id && <div className="text-muted">Tax ID {i.company_tax_id}</div>}</div>
        </div>
        <div className="mt-6 rounded-xl bg-surface-2 p-4 text-sm">
          <div className="font-medium">{i.station_name}</div>
          <div className="text-muted">{i.station_address}, {i.city}</div>
          <div className="text-muted mt-1">{i.port_label} · {i.connector_type} · {i.started_at && dateTime(i.started_at)} – {i.ended_at && new Date(i.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <table className="w-full text-sm mt-6 tabular">
          <tbody className="[&_td]:py-2 [&_tr]:border-b [&_tr]:border-border">
            <tr><td>Energy delivered ({b.energyKwh ?? i.energy_kwh} kWh @ avg {formatMoney(b.averageRate, i.currency)}/kWh)</td><td className="text-right">{formatMoney(b.energyCost, i.currency)}</td></tr>
            {b.serviceCharge > 0 && <tr><td>Service charge</td><td className="text-right">{formatMoney(b.serviceCharge, i.currency)}</td></tr>}
            {b.sessionFee > 0 && <tr><td>Session fee</td><td className="text-right">{formatMoney(b.sessionFee, i.currency)}</td></tr>}
            {b.timeFee > 0 && <tr><td>Time fee</td><td className="text-right">{formatMoney(b.timeFee, i.currency)}</td></tr>}
            {b.parkingFee > 0 && <tr><td>Parking</td><td className="text-right">{formatMoney(b.parkingFee, i.currency)}</td></tr>}
            {b.tax > 0 && <tr><td>Tax</td><td className="text-right">{formatMoney(b.tax, i.currency)}</td></tr>}
            <tr className="!border-0"><td className="font-semibold text-base pt-4">Total</td><td className="text-right font-semibold text-base pt-4">{formatMoney(i.amount, i.currency)}</td></tr>
          </tbody>
        </table>
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="text-muted">Payment: {b.paymentMethod ?? i.payment_provider}</span>
          <Badge tone={i.payment_status === 'paid' ? 'green' : i.payment_status === 'failed' ? 'red' : 'amber'}>{i.payment_status}</Badge>
        </div>
      </Card>
    </div>
  );
}
export default function InvoicePage() {
  return <RequireRole><Invoice /></RequireRole>;
}
