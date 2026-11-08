import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1fr_520px]">
      <div className="hidden lg:flex relative overflow-hidden bg-[#06110c] text-white p-12 flex-col justify-between">
        <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(800px 500px at 20% 20%, rgba(15,169,104,.45), transparent 60%), radial-gradient(700px 500px at 90% 80%, rgba(47,107,255,.35), transparent 60%)' }} />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="relative"><Logo className="text-white" /></div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">Charge smarter.<br />Drive further.</h1>
          <p className="mt-4 text-white/70 text-lg">Find compatible chargers, see what&apos;s free, compare prices across peak and off-peak, and plan EV routes with charging stops that fit your car.</p>
          <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
            {[['Charging curves', 'Realistic time estimates'], ['Time-of-use', 'Start now vs. later'], ['EV routing', 'Stops & arrival SoC']].map(([a, b]) => (
              <div key={a} className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="font-semibold">{a}</div><div className="text-white/60 mt-1">{b}</div></div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Voltway · Demo build</p>
      </div>
      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between"><div className="lg:hidden"><Logo /></div><Link href="/" className="text-sm text-muted hover:text-text ml-auto mr-3">Back to map</Link><ThemeToggle /></div>
        <div className="flex-1 grid place-items-center py-10"><div className="w-full max-w-sm">{children}</div></div>
      </div>
    </div>
  );
}
