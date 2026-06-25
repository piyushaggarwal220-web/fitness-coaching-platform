'use client';

import { Suspense, useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { COACHING_PLAN_LIST, getCoachingPlan } from '@/lib/payments/plans';
import { isTestModeEnabled } from '@/lib/test-mode';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type RazorpayHandlerResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function CheckoutForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPlan = searchParams.get('plan') ?? '6_months';
  const plan = getCoachingPlan(initialPlan) ?? getCoachingPlan('6_months')!;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const testMode = isTestModeEnabled();

  const completeVerification = async (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    const verifyRes = await fetch('/api/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planSlug: plan.slug,
        email,
        name,
        password,
        ...payload,
      }),
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.success) {
      throw new Error(verifyData.error ?? 'Payment verification failed');
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw new Error('Payment succeeded but sign-in failed: ' + signInError.message);
    }

    router.push('/onboarding');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug: plan.slug, email, name }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderData.error ?? 'Failed to create order');
      }

      if (orderData.testMode || testMode) {
        await completeVerification({
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: `test_payment_${Date.now()}`,
          razorpay_signature: 'test_signature',
        });
        return;
      }

      if (!window.Razorpay) {
        throw new Error('Razorpay checkout failed to load. Please refresh and try again.');
      }

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Coaching Platform',
        description: `${plan.name} coaching plan`,
        order_id: orderData.orderId,
        prefill: { name, email },
        handler: async (response: RazorpayHandlerResponse) => {
          try {
            await completeVerification(response);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Verification failed';
            setError(message);
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      });

      rzp.open();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <Link href="/" style={styles.backLink}>← Back to home</Link>
        <h1 style={styles.title}>Complete your purchase</h1>
        <p style={styles.subtitle}>
          {plan.name} plan · {plan.displayPrice} · {plan.saveLabel}
        </p>

        {testMode && (
          <div style={styles.testBanner}>
            TEST MODE — payment will be simulated. No Razorpay charge.
          </div>
        )}

        <div style={styles.planPicker}>
          {COACHING_PLAN_LIST.map((item) => (
            <Link
              key={item.slug}
              href={`/checkout?plan=${item.slug}`}
              style={{
                ...styles.planChip,
                borderColor: item.slug === plan.slug ? '#e94560' : '#ddd',
                backgroundColor: item.slug === plan.slug ? '#fff5f7' : 'white',
              }}
            >
              {item.name}
            </Link>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={styles.input} />

          <label style={styles.label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={styles.input} />

          <label style={styles.label}>Create password (min 6 characters)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
          />

          <button
            type="submit"
            disabled={loading || (!testMode && !razorpayReady)}
            style={styles.payBtn}
          >
            {loading ? 'Processing...' : `Pay ${plan.displayPrice} securely`}
          </button>
        </form>

        <p style={styles.secure}>Secure payments via Razorpay. You&apos;ll complete onboarding right after payment.</p>
      </div>

      {!testMode && (
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          onLoad={() => setRazorpayReady(true)}
        />
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div style={styles.loading}>Loading checkout...</div>}>
      <CheckoutForm />
    </Suspense>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: '#15110D', padding: '40px 20px' },
  card: { maxWidth: 520, margin: '0 auto', backgroundColor: 'white', borderRadius: 16, padding: 32 },
  backLink: { color: '#666', textDecoration: 'none', fontSize: 14 },
  title: { margin: '16px 0 8px', fontSize: 28, color: '#1a1a2e' },
  subtitle: { margin: '0 0 20px', color: '#666' },
  testBanner: { backgroundColor: '#fff3cd', color: '#856404', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 },
  planPicker: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  planChip: { padding: '8px 14px', borderRadius: 999, border: '1px solid #ddd', textDecoration: 'none', color: '#1a1a2e', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 8 },
  input: { padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16 },
  payBtn: { marginTop: 16, padding: 16, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 10, fontSize: 17, fontWeight: 700, cursor: 'pointer' },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 12 },
  secure: { marginTop: 16, fontSize: 13, color: '#888', textAlign: 'center' },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: '#F6F1E7' },
};
