'use client';

import { Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { brandTitle } from '@/lib/brand';
import { COACHING_PLAN_LIST, getCoachingPlan } from '@/lib/payments/plans';
import { createClient } from '@/lib/supabase/client';
import { isPaymentBypassClient } from '@/lib/config';
import { resolveMarketingBaseUrl } from '@/lib/admin/portal-urls';
import { colors, spacing, radius } from '@/lib/design-tokens';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { trackMetaEvent } from '@/lib/analytics/meta-pixel';

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
  const searchParams = useSearchParams();
  const initialPlan = searchParams.get('plan') ?? '3_months';
  const plan = getCoachingPlan(initialPlan) ?? getCoachingPlan('3_months')!;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemValid, setRedeemValid] = useState<{ planName?: string } | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [policyAgreementAccepted, setPolicyAgreementAccepted] = useState(false);
  const [verificationId, setVerificationId] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState<'code' | 'magic_link' | null>(null);
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [missingItems, setMissingItems] = useState<string[]>([]);
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);
  const paymentSucceededRef = useRef(false);
  const testMode = isPaymentBypassClient();

  const resetVerification = () => {
    setVerificationId('');
    setEmailCode('');
    setEmailVerified(false);
    setEmailDelivery(null);
    setEmailLinkSent(false);
  };

  useEffect(() => {
    const vid = searchParams.get('vid')?.trim() ?? '';
    const verified = searchParams.get('emailVerified') === '1';
    if (vid) setVerificationId(vid);
    if (verified && vid) {
      setEmailVerified(true);
      setEmailLinkSent(true);
      setEmailDelivery('magic_link');
    }
  }, [searchParams]);

  useEffect(() => {
    if (testMode || emailVerified || !verificationId || emailDelivery !== 'magic_link') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/payment/verification-status?verificationId=${encodeURIComponent(verificationId)}`
        );
        const data = await res.json();
        if (!cancelled && data.emailVerified) {
          setEmailVerified(true);
        }
      } catch {
        // ignore transient poll errors
      }
    };
    const id = window.setInterval(() => void poll(), 4000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [testMode, emailVerified, verificationId, emailDelivery]);

  useEffect(() => {
    if (testMode) return;
    trackMetaEvent('InitiateCheckout', {
      value: plan.amountPaise / 100,
      currency: 'INR',
      content_name: `${plan.name} coaching plan`,
      content_ids: [plan.slug],
      content_type: 'product',
    });
  }, [plan, testMode]);

  const getMissingRequirements = (): string[] => {
    const missing: string[] = [];
    if (!name.trim()) missing.push('Full name');
    if (!email.trim()) missing.push('Email');
    else if (!email.includes('@')) missing.push('A valid email address');
    if (!phone.trim()) missing.push('WhatsApp number');
    if (!showRedeem && !testMode && !emailVerified) {
      missing.push(
        emailLinkSent
          ? 'Open the verification link in your email (check spam too)'
          : 'Verify your email (tap “Send verification email”)'
      );
    }
    if (!showRedeem && !policyAgreementAccepted) {
      missing.push('Tick the box to agree to Terms & Refund Policy');
    }
    if (!showRedeem && !testMode && !razorpayReady) {
      missing.push('Wait for the payment form to finish loading');
    }
    return missing;
  };

  const sendEmailOtp = async () => {
    setError('');
    setMissingItems([]);
    const precheck: string[] = [];
    if (!email.trim()) precheck.push('Email');
    if (!phone.trim()) precheck.push('WhatsApp number');
    if (precheck.length) {
      setMissingItems(precheck);
      setError(`Before sending verification, fill in: ${precheck.join('; ')}`);
      return;
    }
    setSendingEmailOtp(true);
    try {
      const res = await fetch('/api/payment/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          email,
          phone,
          name,
          verificationId: verificationId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send verification email');
      setVerificationId(data.verificationId);
      setEmailVerified(Boolean(data.emailVerified));
      const delivery = data.delivery === 'code' ? 'code' : 'magic_link';
      setEmailDelivery(delivery);

      if (delivery === 'magic_link' && !data.emailVerified) {
        const redirectTo = `${window.location.origin}/checkout/confirm-email?vid=${encodeURIComponent(data.verificationId)}&plan=${encodeURIComponent(plan.slug)}`;
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: {
            shouldCreateUser: true,
            emailRedirectTo: redirectTo,
          },
        });
        if (otpError) throw new Error(otpError.message);
        setEmailLinkSent(true);
      } else if (typeof data.bypassCode === 'string' && data.bypassCode) {
        setEmailCode(data.bypassCode);
        setEmailLinkSent(true);
      } else if (delivery === 'code') {
        setEmailLinkSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification email');
    } finally {
      setSendingEmailOtp(false);
    }
  };

  const verifyEmailOtp = async () => {
    setError('');
    if (!verificationId) {
      setError('Send a code first');
      return;
    }
    setVerifyingEmailOtp(true);
    try {
      const res = await fetch('/api/payment/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email', code: emailCode, verificationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      setEmailVerified(Boolean(data.emailVerified));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifyingEmailOtp(false);
    }
  };

  const continueAfterPayment = (redirectTo: string) => {
    paymentSucceededRef.current = true;
    setPaymentConfirmed(true);
    setLoading(true);
    // Hard navigation so Razorpay modal dismiss cannot leave the user stuck on checkout.
    window.location.assign(redirectTo);
  };

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
        phone,
        ...payload,
      }),
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.success) {
      throw new Error(verifyData.error ?? 'Payment verification failed');
    }

    if (!testMode) {
      trackMetaEvent(
        'Purchase',
        {
          value: plan.amountPaise / 100,
          currency: 'INR',
          content_name: `${plan.name} coaching plan`,
          content_ids: [plan.slug],
          content_type: 'product',
        },
        { eventID: `razorpay_${payload.razorpay_payment_id}` }
      );
    }

    continueAfterPayment(verifyData.redirectTo ?? '/create-account');
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

      continueAfterPayment(data.redirectTo ?? '/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redemption failed');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMissingItems([]);

    const missing = getMissingRequirements();
    if (missing.length > 0) {
      setMissingItems(missing);
      setError(`Before you can pay, complete these steps:`);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan.slug,
          email,
          name,
          phone,
          policyAgreementAccepted,
          verificationId: verificationId || undefined,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        if (Array.isArray(orderData.missing) && orderData.missing.length > 0) {
          setMissingItems(orderData.missing);
          setError('Before you can pay, complete these steps:');
        }
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
        prefill: { name, email, contact: phone },
        handler: async (response: RazorpayHandlerResponse) => {
          try {
            setLoading(true);
            await completeVerification(response);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Verification failed';
            setError(message);
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            if (!paymentSucceededRef.current) setLoading(false);
          },
        },
      });

      rzp.open();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      setError(message);
      setLoading(false);
    }
  };

  if (paymentConfirmed) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>{brandTitle('Payment confirmed')}</h1>
          <p style={styles.subtitle}>Taking you to create your login password…</p>
        </div>
      </div>
    );
  }

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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <input
                value={redeemCode}
                onChange={(e) => { setRedeemCode(e.target.value); setRedeemValid(null); }}
                placeholder="Enter redemption code"
                style={{ ...styles.input, flex: '1 1 160px', minWidth: 0 }}
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
        {missingItems.length > 0 && (
          <ul style={styles.missingList}>
            {missingItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}

        <form
          onSubmit={showRedeem && redeemValid ? handleRedeem : handleSubmit}
          style={styles.form}
          noValidate
        >
          <label style={styles.label}>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />

          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              resetVerification();
            }}
            style={styles.input}
          />

          <label style={styles.label}>WhatsApp number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              resetVerification();
            }}
            placeholder="+91 98765 43210"
            autoComplete="tel"
            style={styles.input}
          />

          {!showRedeem && !testMode && (
            <div style={styles.otpBox}>
              <p style={styles.otpHint}>
                Verify your email before paying. We email a secure link — open it on this phone to continue.
              </p>
              <div style={styles.otpStatus}>
                Email {emailVerified ? '✓ verified' : emailLinkSent ? 'link sent — check inbox/spam' : 'not verified'}
              </div>
              <div style={styles.otpBtnRow}>
                <button
                  type="button"
                  onClick={() => void sendEmailOtp()}
                  disabled={sendingEmailOtp || emailVerified || !email.trim() || !phone.trim()}
                  style={styles.otpBtn}
                >
                  {sendingEmailOtp
                    ? 'Sending…'
                    : emailVerified
                      ? 'Verified'
                      : emailLinkSent
                        ? 'Resend email'
                        : 'Send verification email'}
                </button>
                {emailLinkSent && !emailVerified && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!verificationId) return;
                      const res = await fetch(
                        `/api/payment/verification-status?verificationId=${encodeURIComponent(verificationId)}`
                      );
                      const data = await res.json();
                      if (data.emailVerified) setEmailVerified(true);
                      else setError('Not verified yet. Open the newest link in your email, then tap this again.');
                    }}
                    style={styles.otpBtnSecondary}
                  >
                    I’ve opened the link
                  </button>
                )}
              </div>
              {emailDelivery === 'code' && !emailVerified && (
                <>
                  <input
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="Code from email"
                    inputMode="numeric"
                    style={styles.otpInput}
                  />
                  <button
                    type="button"
                    onClick={() => void verifyEmailOtp()}
                    disabled={verifyingEmailOtp || emailCode.length < 6 || !verificationId}
                    style={styles.otpBtn}
                  >
                    {verifyingEmailOtp ? 'Checking…' : 'Verify code'}
                  </button>
                </>
              )}
            </div>
          )}

          {showRedeem && redeemValid && (
            <>
              <label style={styles.label}>Create your login password (min 6 characters)</label>
              <p style={styles.hint}>
                This is a normal password you will type when signing in — not a phone passkey / Face ID.
              </p>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                inputStyle={styles.input}
                name="redeem-password"
                aria-label="Create login password"
                autoComplete="new-password"
              />
            </>
          )}

          {!showRedeem && (
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={policyAgreementAccepted}
                onChange={(event) => setPolicyAgreementAccepted(event.target.checked)}
                aria-describedby="checkout-policy-agreement"
                style={{ marginTop: 3 }}
              />
              <span id="checkout-policy-agreement">
                I have read and agree to the{' '}
                <Link href="/terms" target="_blank" style={{ color: colors.accent }}>Terms &amp; Conditions</Link>
                {' '}and{' '}
                <Link href="/refund-policy" target="_blank" style={{ color: colors.accent }}>Refund Policy</Link>.
                The results guarantee requires a documented no-result claim and at least 90% of
                due check-ins submitted within each 48-hour window. Statutory rights still apply.
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={loading || (showRedeem && !redeemValid)}
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
          Secure payments via Razorpay. After payment you&apos;ll create your login password (not a passkey).
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
  page: {
    minHeight: '100vh',
    backgroundColor: colors.bgPrimary,
    padding: `${spacing[4]}px ${spacing[2]}px`,
    overflowX: 'hidden',
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    margin: '0 auto',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing[4],
    border: `1px solid ${colors.borderSubtle}`,
    boxSizing: 'border-box',
  },
  backLink: { color: colors.textMuted, textDecoration: 'none', fontSize: 14 },
  title: { margin: '16px 0 8px', fontSize: 28, color: colors.textPrimary, fontWeight: 800, letterSpacing: '-0.02em' },
  subtitle: { margin: '0 0 20px', color: colors.textSecondary },
  testBanner: { backgroundColor: colors.warningMuted, color: colors.warning, padding: spacing[2], borderRadius: radius.sm, marginBottom: spacing[3], fontSize: 14 },
  planPicker: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: spacing[4] },
  planChip: { padding: '8px 14px', borderRadius: 999, border: `1px solid ${colors.borderSubtle}`, textDecoration: 'none', color: colors.textPrimary, fontSize: 14, backgroundColor: colors.bgElevated },
  form: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 8, color: colors.textSecondary },
  input: {
    padding: '14px 16px',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    fontSize: 16,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    minHeight: 56,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  },
  payBtn: {
    marginTop: spacing[3],
    padding: 16,
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    borderRadius: radius.md,
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    minHeight: 56,
    width: '100%',
    boxSizing: 'border-box',
  },
  error: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: spacing[2], borderRadius: radius.sm, marginBottom: spacing[2] },
  missingList: {
    margin: '0 0 12px',
    padding: '12px 12px 12px 28px',
    backgroundColor: colors.warningMuted,
    color: colors.warning,
    borderRadius: radius.sm,
    fontSize: 14,
    lineHeight: 1.45,
  },
  secure: { marginTop: spacing[3], fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 1.5 },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: colors.textSecondary, backgroundColor: colors.bgPrimary },
  redeemLink: { background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: spacing[3], padding: '8px 0', minHeight: 44 },
  redeemBox: { backgroundColor: colors.accentMuted, padding: spacing[3], borderRadius: radius.sm, marginBottom: spacing[3], boxSizing: 'border-box', width: '100%' },
  validateBtn: {
    padding: '12px 16px',
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 48,
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
  },
  validBanner: { backgroundColor: colors.successMuted, color: colors.success, padding: 10, borderRadius: radius.sm, fontSize: 14, marginBottom: 8 },
  backToPay: { background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 13, padding: '8px 0', minHeight: 44 },
  otpBox: {
    marginTop: 8,
    padding: spacing[3],
    borderRadius: radius.sm,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  },
  otpHint: { margin: 0, fontSize: 13, color: colors.textSecondary, lineHeight: 1.4 },
  otpStatus: { fontSize: 13, fontWeight: 600, color: colors.textSecondary },
  otpInput: {
    padding: '14px 16px',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    fontSize: 16,
    backgroundColor: colors.bgCard,
    color: colors.textPrimary,
    minHeight: 48,
    width: '100%',
    boxSizing: 'border-box',
  },
  otpBtnRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  otpBtn: {
    padding: '12px 14px',
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 48,
    flex: '1 1 140px',
    boxSizing: 'border-box',
  },
  otpBtnSecondary: {
    padding: '12px 14px',
    backgroundColor: colors.bgCard,
    color: colors.textPrimary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 48,
    flex: '1 1 140px',
    boxSizing: 'border-box',
  },
  hint: { margin: '0 0 4px', fontSize: 13, color: colors.textMuted, lineHeight: 1.4 },
};
