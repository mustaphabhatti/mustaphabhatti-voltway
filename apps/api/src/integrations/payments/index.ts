import { config } from '../../config';
import { fetchJson, reportError, reportOk } from '../health';

export interface ChargeRequest {
  amount: number;
  currency: string;
  description: string;
  paymentMethod: { id: string; type: string; provider: string; provider_ref: string | null } | null;
  metadata?: Record<string, string>;
}

export interface ChargeResult {
  status: 'paid' | 'failed' | 'pending';
  provider: string;
  ref: string | null;
  message?: string;
}

export interface PaymentProvider {
  name: string;
  /** true when no real money moves — the UI labels these invoices "demo". */
  isDemo: boolean;
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

/** Demo provider: approves every payment without moving money. */
const demoProvider: PaymentProvider = {
  name: 'demo',
  isDemo: true,
  async charge(req) {
    if (req.amount < 0) return { status: 'failed', provider: 'demo', ref: null, message: 'Negative amount' };
    return { status: 'paid', provider: 'demo', ref: `demo_${Date.now().toString(36)}` };
  },
};

/** Stripe PaymentIntents (off-session). Requires a saved Stripe payment method id in provider_ref. */
const stripeProvider: PaymentProvider = {
  name: 'stripe',
  isDemo: false,
  async charge(req) {
    if (!req.paymentMethod?.provider_ref) return { status: 'failed', provider: 'stripe', ref: null, message: 'No Stripe payment method on file' };
    const zeroDecimal = ['JPY', 'KRW'].includes(req.currency.toUpperCase());
    const body = new URLSearchParams({
      amount: String(Math.round(req.amount * (zeroDecimal ? 1 : 100))),
      currency: req.currency.toLowerCase(),
      payment_method: req.paymentMethod.provider_ref,
      confirm: 'true',
      off_session: 'true',
      description: req.description,
    });
    for (const [k, v] of Object.entries(req.metadata ?? {})) body.append(`metadata[${k}]`, v);
    try {
      const pi = await fetchJson<any>('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        timeoutMs: 15000,
      });
      reportOk('payments:stripe');
      return { status: pi.status === 'succeeded' ? 'paid' : 'pending', provider: 'stripe', ref: pi.id };
    } catch (e) {
      reportError('payments:stripe', e);
      return { status: 'failed', provider: 'stripe', ref: null, message: (e as Error).message };
    }
  },
};

export function paymentProvider(): PaymentProvider {
  if (config.paymentProvider === 'stripe' && config.stripeSecretKey) return stripeProvider;
  return demoProvider;
}

/** Local gateways (e.g. mobile wallets) plug in here once merchant credentials are available. */
export const SUPPORTED_METHOD_TYPES = [
  { type: 'card', providers: ['demo', 'stripe'], label: 'Credit / debit card' },
  { type: 'wallet', providers: ['demo', 'apple_pay', 'google_pay'], label: 'Digital wallet' },
  { type: 'local_gateway', providers: ['demo', 'jazzcash', 'easypaisa', 'raast'], label: 'Local payment gateway' },
];
