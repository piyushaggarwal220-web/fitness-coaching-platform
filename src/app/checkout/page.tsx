'use client';

import { Suspense, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { brandTitle } from '@/lib/brand';
import { COACHING_PLAN_LIST, getCoachingPlan } from '@/lib/payments/plans';
import { createClient } from '@/lib/supabase/client';
import { isPaymentBypassClient } from '@/lib/config';
import { resolveMarketingBaseUrl } from '@/lib/admin/portal-urls';
import { colors, spacing, radius } from '@/lib/design-tokens';
import { PasswordInput } from '@/components/ui/PasswordInput';

const supabase = createClient();
const marketingBaseUrl = resolveMarketingBaseUrl();

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
  const initialPlan = searchParams.get('plan') ?? '3_months';
  const plan = getCoachingPlan(initialPlan) ?? getCoachingPlan('3_months')!;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemValid, setRedeemValid] = useState<{ planName?: string } | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const testMode = isPaymentBypassClient();

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
        ...payload,
      }),
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.success) {
      throw new Error(verifyData.error ?? 'Payment verification failed');
    }

    router.refresh();
    router.push(verifyData.redirectTo ?? '/create-account');
  };

  const validateCode = async () => {
    if (!redeemCode.trim()) return;
    setValidatingCode(true);
    setError('');
    try {
      const res = await fetch('/api/redemption/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode }),
      });
      const data = await res.json();
      if (!data.valid) throw new Error(data.error ?? 'Invalid code');
      setRedeemValid({ planName: data.planName });
    } catch (err) {
      setRedeemValid(null);
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setValidatingCode(false);
    }
  };

  const handleRedeem = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/redemption/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode, email, name, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Redemption failed');

      if (!data.sessionEstablished) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signInError) throw new Error('Account created but sign-in failed. Please log in.');
      }

      router.refresh();
      router.push(data.redirectTo ?? '/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redemption failed');
      setLoading(false);
    }
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
        name: 'LURVOX',
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
        <Link href={marketingBaseUrl} style={styles.backLink}>← Back to home</Link>
        <h1 style={styles.title}>{brandTitle('Complete your purchase')}</h1>
        <p style={styles.subtitle}>
          {plan.name} plan · {plan.displayPrice} · {plan.saveLabel}
        </p>

        {testMode && (
          <div style={styles.testBanner}>
            DEVELOPMENT MODE — payment will be simulated. No Razorpay charge.
          </div>
        )}

        {!showRedeem ? (
          <button type="button" onClick={() => setShowRedeem(true)} style={styles.redeemLink}>
            I already have a code →
          </button>
        ) : (
          <div style={styles.redeemBox}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Redeem your code</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={redeemCode}
                onChange={(e) => { setRedeemCode(e.target.value); setRedeemValid(null); }}
                placeholder="Enter redemption code"
                style={{ ...styles.input, flex: 1 }}
              />
              <button type="button" onClick={() => void validateCode()} disabled={validatingCode} style={styles.validateBtn}>
                {validatingCode ? '...' : 'Validate'}
              </button>
            </div>
            {redeemValid && (
              <div style={styles.validBanner}>✓ Valid code — {redeemValid.planName} plan</div>
            )}
            <button type="button" onClick={() => { setShowRedeem(false); setRedeemCode(''); setRedeemValid(null); }} style={styles.backToPay}>
              ← Back to payment
            </button>
          </div>
        )}

        <div style={styles.planPicker}>
          {COACHING_PLAN_LIST.map((item) => (
            <Link
              key={item.slug}
              href={`/checkout?plan=${item.slug}`}
              style={{
                ...styles.planChip,
                borderColor: item.slug === plan.slug ? colors.accent : colors.borderSubtle,
                backgroundColor: item.slug === plan.slug ? colors.accentMuted : colors.bgElevated,
              }}
            >
              {item.name} · {item.displayPrice}
            </Link>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={showRedeem && redeemValid ? handleRedeem : handleSubmit} style={styles.form}>
          <label style={styles.label}>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={styles.input} />

          <label style={styles.label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={styles.input} />

          {showRedeem && redeemValid && (
            <>
              <label style={styles.label}>Create password (min 6 characters)</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                inputStyle={styles.input}
                name="redeem-passcode"
                aria-label="Create password"
                autoComplete="off"
              />
            </>
          )}

          <button
            type="submit"
            disabled={loading || (showRedeem ? !redeemValid : (!testMode && !razorpayReady))}
            style={styles.payBtn}
          >
            {loading
              ? 'Processing...'
              : showRedeem && redeemValid
                ? 'Redeem & Continue'
                : `Pay ${plan.displayPrice} securely`}
          </button>
        </form>

        <p style={styles.secure}>
          Secure payments via Razorpay. After payment you&apos;ll create your account password.
          {' '}
          <Link href="/create-account" style={{ color: colors.accent }}>Already paid?</Link>
        </p>
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
  page: { minHeight: '100vh', backgroundColor: colors.bgPrimary, padding: `${spacing[6]}px ${spacing[3]}px` },
  card: { maxWidth: 520, margin: '0 auto', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing[6], border: `1px solid ${colors.borderSubtle}` },
  backLink: { color: colors.textMuted, textDecoration: 'none', fontSize: 14 },
  title: { margin: '16px 0 8px', fontSize: 28, color: colors.textPrimary, fontWeight: 800, letterSpacing: '-0.02em' },
  subtitle: { margin: '0 0 20px', color: colors.textSecondary },
  testBanner: { backgroundColor: colors.warningMuted, color: colors.warning, padding: spacing[2], borderRadius: radius.sm, marginBottom: spacing[3], fontSize: 14 },
  planPicker: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: spacing[4] },
  planChip: { padding: '8px 14px', borderRadius: 999, border: `1px solid ${colors.borderSubtle}`, textDecoration: 'none', color: colors.textPrimary, fontSize: 14, backgroundColor: colors.bgElevated },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 8, color: colors.textSecondary },
  input: { padding: '14px 16px', border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.sm, fontSize: 16, backgroundColor: colors.bgElevated, color: colors.textPrimary, minHeight: 56 },
  payBtn: { marginTop: spacing[3], padding: 16, backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: radius.md, fontSize: 17, fontWeight: 700, cursor: 'pointer', minHeight: 56 },
  error: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: spacing[2], borderRadius: radius.sm, marginBottom: spacing[2] },
  secure: { marginTop: spacing[3], fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 1.5 },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: colors.textSecondary, backgroundColor: colors.bgPrimary },
  redeemLink: { background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: spacing[3], padding: '8px 0', minHeight: 44 },
  redeemBox: { backgroundColor: colors.accentMuted, padding: spacing[3], borderRadius: radius.sm, marginBottom: spacing[3] },
  validateBtn: { padding: '12px 16px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: radius.sm, fontWeight: 600, cursor: 'pointer', minHeight: 48, whiteSpace: 'nowrap' },
  validBanner: { backgroundColor: colors.successMuted, color: colors.success, padding: 10, borderRadius: radius.sm, fontSize: 14, marginBottom: 8 },
  backToPay: { background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 13, padding: '8px 0', minHeight: 44 },
};
