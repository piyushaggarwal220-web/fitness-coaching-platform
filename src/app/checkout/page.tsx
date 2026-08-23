'use client';

import { Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { BRAND_NAME } from '@/lib/brand';
import { COACHING_PLAN_LIST, getCoachingPlan } from '@/lib/payments/plans';
import { planDurationLabel, planGoalName } from '@/lib/payments/plan-pages';
import { createClient } from '@/lib/supabase/client';
import { isPaymentBypassClient } from '@/lib/config';
import { resolveAuthEmailRedirectOrigin, resolveMarketingBaseUrl } from '@/lib/admin/portal-urls';
import { colors, spacing, radius } from '@/lib/design-tokens';
import { queueMetaPurchase } from '@/lib/analytics/meta-pixel';
import { trackFunnelStep } from '@/lib/analytics/funnel';
import {
  formatInrFromPaise,
  firstTimerSalePaise,
  discountPaiseForPlan,
  getFirstTimerDiscountCode,
  isFirstTimerDiscountCode,
  CHECKOUT_ADDONS,
  CHECKOUT_ADDON_UNIT_PAISE,
  checkoutAddonsPaise,
  parseCheckoutAddonIds,
  type CheckoutAddonId,
} from '@/lib/payments/checkout-discounts';
import {
  affiliateDiscountPaise,
  affiliateSalePaise,
  getAffiliateCode,
} from '@/lib/payments/affiliate-codes';
import {
  formatCountdownHms,
  getSaleCountdownRemainingMs,
} from '@/lib/sale-countdown';
import { CheckoutTransformationCarousel } from '@/components/checkout/TransformationCarousel';
import { CheckoutAddonPicker } from '@/components/checkout/CheckoutAddonPicker';

const supabase = createClient();
const marketingBaseUrl = resolveMarketingBaseUrl();
const PAYMENT_SUCCESS_KEY = 'lurvox_checkout_success_redirect';

type AppliedDiscountPreview = {
  code: string;
  discountPaise: number;
  amountPaise: number;
  listAmountPaise: number;
  displayListPrice: string;
  displaySalePrice: string;
  displayDiscount: string;
  message: string;
};

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
  const codeFromUrl = (searchParams.get('code') ?? '').trim().toUpperCase();
  const plan = getCoachingPlan(initialPlan) ?? getCoachingPlan('3_months')!;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [policyAgreementAccepted, setPolicyAgreementAccepted] = useState(false);
  const [addonIds, setAddonIds] = useState<CheckoutAddonId[]>([]);
  const [verificationId, setVerificationId] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState<'code' | 'magic_link' | null>(null);
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [missingItems, setMissingItems] = useState<string[]>([]);
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);
  const welcomeCode = getFirstTimerDiscountCode();
  const [referralCode, setReferralCode] = useState(
    codeFromUrl || (plan.isTrial ? '' : welcomeCode)
  );
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscountPreview | null>(null);
  const [saleCountdown, setSaleCountdown] = useState('08:00:00');
  const [applyingCode, setApplyingCode] = useState(false);
  const [enrollmentHref, setEnrollmentHref] = useState<string | null>(null);
  const [attemptedPay, setAttemptedPay] = useState(false);
  const [checkoutScreen, setCheckoutScreen] = useState<1 | 2>(1);
  const paymentSucceededRef = useRef(false);
  const autoApplyKeyRef = useRef('');
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const policyRef = useRef<HTMLLabelElement>(null);
  const verifyRef = useRef<HTMLDivElement>(null);
  const testMode = isPaymentBypassClient();
  const isTrialCheckout = plan.isTrial === true;
  const planPayablePaise = appliedDiscount?.amountPaise ?? plan.amountPaise;
  const addonsAvailable = !isTrialCheckout;
  const selectedAddonIds = addonsAvailable ? addonIds : [];
  const payablePaise = planPayablePaise + checkoutAddonsPaise(selectedAddonIds);
  const payableDisplay = formatInrFromPaise(payablePaise);
  const firstTimerPreviewPaise = firstTimerSalePaise(plan.slug);
  const firstTimerPreviewDisplay =
    firstTimerPreviewPaise != null ? formatInrFromPaise(firstTimerPreviewPaise) : plan.displayPrice;
  const firstTimerSavingsPaise =
    firstTimerPreviewPaise != null ? plan.amountPaise - firstTimerPreviewPaise : null;

  useEffect(() => {
    const fromUrl = parseCheckoutAddonIds(searchParams.get('addons'));
    if (fromUrl.length) setAddonIds(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    setEnrollmentHref(null);
    autoApplyKeyRef.current = '';
    if (isTrialCheckout) {
      setReferralCode('');
      setAppliedDiscount(null);
    } else if (codeFromUrl) {
      setReferralCode(codeFromUrl);
    } else {
      setReferralCode((prev) => prev || welcomeCode);
    }
  }, [plan.slug, isTrialCheckout, codeFromUrl, welcomeCode]);

  useEffect(() => {
    const tick = () => {
      setSaleCountdown(formatCountdownHms(getSaleCountdownRemainingMs()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const buildLocalWelcomeDiscount = (code: string): AppliedDiscountPreview | null => {
    if (isTrialCheckout) return null;

    const affiliate = getAffiliateCode(code);
    if (affiliate) {
      const discountPaise = affiliateDiscountPaise(code, plan.slug, plan.amountPaise);
      const amountPaise = affiliateSalePaise(code, plan.slug);
      if (discountPaise == null || amountPaise == null) return null;
      return {
        code: affiliate.code,
        discountPaise,
        amountPaise,
        listAmountPaise: plan.amountPaise,
        displayListPrice: plan.displayPrice,
        displaySalePrice: formatInrFromPaise(amountPaise),
        displayDiscount: formatInrFromPaise(discountPaise),
        message: `Referral applied — save ${formatInrFromPaise(discountPaise)} on ${plan.name} (sale + ${affiliate.extraPercentOffSale}% via ${affiliate.referrerLabel}).`,
      };
    }

    if (!isFirstTimerDiscountCode(code)) return null;
    const discountPaise = discountPaiseForPlan(plan.slug, plan.amountPaise);
    const amountPaise = firstTimerSalePaise(plan.slug, plan.amountPaise);
    if (discountPaise == null || amountPaise == null) return null;
    return {
      code: getFirstTimerDiscountCode(),
      discountPaise,
      amountPaise,
      listAmountPaise: plan.amountPaise,
      displayListPrice: plan.displayPrice,
      displaySalePrice: formatInrFromPaise(amountPaise),
      displayDiscount: formatInrFromPaise(discountPaise),
      message: `Discount applied — save ${formatInrFromPaise(discountPaise)} on ${plan.name}.`,
    };
  };

  const applyReferralCode = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError('');
    setEnrollmentHref(null);
    const code = referralCode.trim();
    if (!code) {
      setAppliedDiscount(null);
      return;
    }

    // Instant local apply for WELCOME60 / LUKE — no email required.
    const local = buildLocalWelcomeDiscount(code);
    if (local) setAppliedDiscount(local);

    setApplyingCode(true);
    try {
      const res = await fetch('/api/payment/apply-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          planSlug: plan.slug,
          email: email.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not apply referral code');

      if (data.kind === 'enrollment') {
        setAppliedDiscount(null);
        setEnrollmentHref(data.enrollHref ?? `/enroll?code=${encodeURIComponent(code)}`);
        return;
      }

      setAppliedDiscount({
        code: data.code,
        discountPaise: data.discountPaise,
        amountPaise: data.amountPaise,
        listAmountPaise: data.listAmountPaise,
        displayListPrice: data.displayListPrice,
        displaySalePrice: data.displaySalePrice,
        displayDiscount: data.displayDiscount,
        message: data.message,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not apply referral code';
      // Eligibility failed (invalid code, etc.) — drop the preview discount when email is known.
      if (email.trim().includes('@') || !local) {
        setAppliedDiscount(null);
      }
      if (!opts?.silent || email.trim().includes('@')) {
        setError(message);
      }
    } finally {
      setApplyingCode(false);
    }
  };

  // Auto-apply as soon as a code is present (no email required).
  useEffect(() => {
    if (isTrialCheckout || applyingCode) return;
    if (!referralCode.trim()) {
      setAppliedDiscount(null);
      return;
    }
    const key = `${plan.slug}|${referralCode}|${email.trim().toLowerCase() || 'no-email'}`;
    if (autoApplyKeyRef.current === key) return;
    autoApplyKeyRef.current = key;
    const timer = window.setTimeout(() => {
      void applyReferralCode({ silent: true });
    }, 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, referralCode, plan.slug, isTrialCheckout]);

  const clearReferralCode = () => {
    setReferralCode(isTrialCheckout ? '' : welcomeCode);
    setAppliedDiscount(null);
    setEnrollmentHref(null);
    setError('');
    autoApplyKeyRef.current = '';
  };

  const resetVerification = () => {
    setVerificationId('');
    setEmailCode('');
    setEmailVerified(false);
    setEmailDelivery(null);
    setEmailLinkSent(false);
  };

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PAYMENT_SUCCESS_KEY);
      if (stored) {
        paymentSucceededRef.current = true;
        setPaymentConfirmed(true);
        window.location.replace(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

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
    const sale = firstTimerSalePaise(plan.slug);
    trackFunnelStep('checkout_view', {
      plan: plan.slug,
      plan_name: plan.name,
      value: (sale ?? plan.amountPaise) / 100,
    });
  }, [plan, testMode]);

  const getMissingRequirements = (): string[] => {
    const missing: string[] = [];
    if (!name.trim()) missing.push('Full name');
    if (!email.trim()) missing.push('Email');
    else if (!email.includes('@')) missing.push('A valid email address');
    if (!phone.trim()) missing.push('WhatsApp number');
    if (!testMode && !emailVerified) {
      missing.push(
        emailLinkSent
          ? 'Open the verification link in your email (check spam too)'
          : 'Verify your email (tap “Send verification email”)'
      );
    }
    if (!policyAgreementAccepted) {
      missing.push('Tick the box to agree to the Terms & Conditions');
    }
    if (!testMode && !razorpayReady) {
      missing.push('Wait for the payment form to finish loading');
    }
    return missing;
  };

  const liveMissing = getMissingRequirements();

  const focusFirstMissing = () => {
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      emailRef.current?.focus();
      return;
    }
    if (!phone.trim()) {
      phoneRef.current?.focus();
      return;
    }
    if (!testMode && !emailVerified) {
      verifyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!policyAgreementAccepted) {
      policyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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
        // Always use the public app origin — never localhost (emails open on other devices).
        const appOrigin = resolveAuthEmailRedirectOrigin(window.location.origin);
        const redirectTo = `${appOrigin}/checkout/confirm-email?vid=${encodeURIComponent(data.verificationId)}&plan=${encodeURIComponent(plan.slug)}${
          referralCode.trim()
            ? `&code=${encodeURIComponent(referralCode.trim())}`
            : ''
        }`;
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
    const target = redirectTo.startsWith('http')
      ? redirectTo
      : `${window.location.origin}${redirectTo.startsWith('/') ? redirectTo : `/${redirectTo}`}`;
    try {
      sessionStorage.setItem(PAYMENT_SUCCESS_KEY, target);
    } catch {
      // ignore
    }
    // replace so browser Back cannot return to an unfinished checkout
    window.location.replace(target);
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
      // Queue + image beacon + fbq; flush retries on create-account/login after redirect.
      queueMetaPurchase({
        eventID: `razorpay_${payload.razorpay_payment_id}`,
        value: payablePaise / 100,
        currency: 'INR',
        content_name: `${plan.name} coaching plan`,
        content_ids: [plan.slug],
        content_type: 'product',
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    continueAfterPayment(verifyData.redirectTo ?? '/create-account');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMissingItems([]);
    setAttemptedPay(true);

    const missing = getMissingRequirements();
    if (missing.length > 0) {
      setMissingItems(missing);
      setError(`Before you can pay, complete these steps:`);
      setLoading(false);
      focusFirstMissing();
      return;
    }

    setLoading(true);

    try {
      const sale = firstTimerSalePaise(plan.slug);
      trackFunnelStep('pay_click', {
        plan: plan.slug,
        plan_name: plan.name,
        value: (appliedDiscount?.amountPaise ?? sale ?? plan.amountPaise) / 100,
      });

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
          discountCode: appliedDiscount?.code || undefined,
          addonIds: selectedAddonIds,
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
          <Link href={marketingBaseUrl} style={styles.backLink}>← Back to home</Link>
          <p style={styles.brandMark}>{BRAND_NAME}</p>
          <h1 style={styles.title}>Payment confirmed</h1>
          <p style={styles.subtitle}>Taking you to create your login password…</p>
        </div>
      </div>
    );
  }

  const pricePrimary = appliedDiscount?.displaySalePrice ?? firstTimerPreviewDisplay;
  const priceMrp = appliedDiscount?.displayListPrice ?? plan.displayPrice;
  const discountLockedIn = Boolean(appliedDiscount);
  const offerSaveDisplay =
    appliedDiscount?.displayDiscount
    ?? (firstTimerSavingsPaise != null ? formatInrFromPaise(firstTimerSavingsPaise) : null);

  return (
    <div style={{ ...styles.page, ...(checkoutScreen === 2 ? styles.pageWithSticky : null) }}>
      <div style={styles.card}>
        <Link href={marketingBaseUrl} style={styles.backLink}>← Back to home</Link>

        <p style={styles.brandMark}>{BRAND_NAME}</p>
        <h1 style={styles.title}>
          {isTrialCheckout ? 'Start your 7-day trial' : 'Checkout'}
        </h1>
        <p style={styles.subtitle}>
          {checkoutScreen === 1
            ? (isTrialCheckout
              ? 'Full coaching access for 7 days. Upgrade anytime.'
              : 'Choose your plan and enter your details.')
            : 'Verify your email and pay securely.'}
        </p>

        <div style={styles.screenDots} aria-label={`Checkout step ${checkoutScreen} of 2`}>
          <span style={{ ...styles.screenDot, ...(checkoutScreen === 1 ? styles.screenDotActive : null) }} />
          <span style={{ ...styles.screenDot, ...(checkoutScreen === 2 ? styles.screenDotActive : null) }} />
        </div>

        {checkoutScreen === 1 && (
          <>
            {!isTrialCheckout && (
              <div style={styles.trustStrip} aria-label="Checkout trust">
                <div style={styles.trustBadges}>
                  <span style={styles.trustBadge}>UPI</span>
                  <span style={styles.trustBadge}>Cards</span>
                  <span style={styles.trustBadge}>Netbanking</span>
                  <span style={styles.trustBadge}>Razorpay Secure</span>
                </div>
                <p style={styles.trustLine}>
                  Secure checkout via Razorpay. By paying, you agree to our{' '}
                  <Link href="/terms" target="_blank" style={styles.inlineLink}>
                    Terms &amp; Conditions
                  </Link>
                  .
                </p>
              </div>
            )}

            {!isTrialCheckout && (
              <div style={styles.planPicker} role="tablist" aria-label="Choose plan">
                {COACHING_PLAN_LIST.map((item) => {
                  const selected = item.slug === plan.slug;
                  const sale = firstTimerSalePaise(item.slug);
                  const saleLabel = sale != null ? formatInrFromPaise(sale) : item.displayPrice;
                  return (
                    <Link
                      key={item.slug}
                      href={`/checkout?plan=${item.slug}${referralCode ? `&code=${encodeURIComponent(referralCode)}` : ''}`}
                      role="tab"
                      aria-selected={selected}
                      onClick={() =>
                        trackFunnelStep('checkout_plan_switch', {
                          plan: item.slug,
                          plan_name: item.name,
                          value: (sale ?? item.amountPaise) / 100,
                        })
                      }
                      style={{
                        ...styles.planChip,
                        ...(selected ? styles.planChipSelected : null),
                      }}
                    >
                      <span style={styles.planChipName}>{planGoalName(item.slug)}</span>
                      <span style={styles.planChipDuration}>{planDurationLabel(item.slug)}</span>
                      <span style={styles.planChipPrice}>{saleLabel}</span>
                      <span style={styles.planChipMrp}>{item.displayPrice}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {addonsAvailable && (
              <CheckoutAddonPicker
                selectedIds={selectedAddonIds}
                onToggle={(id) => {
                  setAddonIds((current) =>
                    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
                  )
                }}
              />
            )}

            {isTrialCheckout && (
              <div style={styles.trialBadge}>
                {plan.name} · {plan.displayPrice}
              </div>
            )}

            <section style={styles.orderSummary}>
              <div style={styles.orderRow}>
                <div>
                  <div style={styles.orderPlanName}>
                    {isTrialCheckout
                      ? `${plan.name} coaching`
                      : `${planGoalName(plan.slug)} · ${planDurationLabel(plan.slug)}`}
                  </div>
                  <div style={styles.orderPlanMeta}>
                    Workout · diet · check-ins · coach chat
                  </div>
                </div>
                <div style={styles.orderPriceCol}>
                  {!isTrialCheckout && <s style={styles.orderSummaryMrp}>{priceMrp}</s>}
                  <span style={styles.orderSummaryPrice}>
                    {isTrialCheckout ? plan.displayPrice : payableDisplay}
                  </span>
                </div>
              </div>

              {selectedAddonIds.map((id) => {
                const addon = CHECKOUT_ADDONS.find((item) => item.id === id)
                if (!addon) return null
                return (
                  <div key={id} style={{ ...styles.orderRow, marginTop: 10 }}>
                    <div>
                      <div style={styles.orderPlanName}>{addon.name}</div>
                      <div style={styles.orderPlanMeta}>Add-on protocol</div>
                    </div>
                    <span style={styles.orderSummaryPrice}>+ {formatInrFromPaise(CHECKOUT_ADDON_UNIT_PAISE)}</span>
                  </div>
                )
              })}
                <div style={styles.offerBanner}>
                  <div style={styles.offerBannerTop}>
                    <strong>{discountLockedIn ? '60% off applied' : '60% off with code'}</strong>
                    {offerSaveDisplay && <span style={styles.offerSave}>Save {offerSaveDisplay}</span>}
                  </div>
                  <p style={styles.offerBannerText}>
                    {discountLockedIn
                      ? `You pay ${appliedDiscount!.displaySalePrice} today.`
                      : 'Enter your code and tap Apply — available for new and returning customers.'}
                  </p>
                  {discountLockedIn ? (
                    <div style={styles.appliedCodeRow}>
                      <span style={styles.appliedCodeChip}>{appliedDiscount!.code}</span>
                      <button type="button" onClick={clearReferralCode} style={styles.backToPay}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div style={styles.codeRow}>
                      <input
                        value={referralCode}
                        onChange={(e) => {
                          setReferralCode(e.target.value.toUpperCase());
                          setEnrollmentHref(null);
                          setAppliedDiscount(null);
                        }}
                        placeholder={welcomeCode}
                        autoComplete="off"
                        aria-label="Discount code"
                        style={{ ...styles.input, marginTop: 0, flex: 1, minHeight: 48 }}
                      />
                      <button
                        type="button"
                        onClick={() => void applyReferralCode()}
                        disabled={applyingCode || !referralCode.trim()}
                        style={styles.validateBtn}
                      >
                        {applyingCode ? '…' : 'Apply'}
                      </button>
                    </div>
                  )}
                  <div style={styles.priceIncreaseTimer} aria-live="polite">
                    <span style={styles.priceIncreaseLabel}>Price increases in</span>
                    <strong style={styles.priceIncreaseValue}>{saleCountdown}</strong>
                  </div>
                  {enrollmentHref && (
                    <div style={styles.discountApplied}>
                      <p style={{ margin: '0 0 10px' }}>
                        This looks like a membership enrollment code — redeem it on the enrollment page.
                      </p>
                      <a
                        href={enrollmentHref}
                        style={{ ...styles.validateBtn, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}
                      >
                        Continue to enrollment →
                      </a>
                    </div>
                  )}
                </div>
            </section>

            <p style={styles.leagueNote}>
              {isTrialCheckout
                ? 'Once per person. Includes coach chat, personal plan, trackers, and check-ins.'
                : plan.slug === '12_months'
                  ? 'Includes a weekly coach phone call. 12 month exclusive.'
                  : 'Personal workout, diet, coach chat, and weekly check-ins are included.'}
            </p>

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.form}>
              <h2 style={styles.sectionLabel}>Your details</h2>

              <label style={styles.label} htmlFor="checkout-name">Full name</label>
              <input
                id="checkout-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                style={styles.input}
              />

              <label style={styles.label} htmlFor="checkout-email">Email</label>
              <input
                id="checkout-email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  resetVerification();
                }}
                autoComplete="email"
                style={styles.input}
              />

              <label style={styles.label} htmlFor="checkout-phone">WhatsApp number</label>
              <input
                id="checkout-phone"
                ref={phoneRef}
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

              <button
                type="button"
                style={styles.payBtn}
                onClick={() => {
                  const missing: string[] = [];
                  if (!name.trim()) missing.push('Full name');
                  if (!email.trim()) missing.push('Email');
                  if (!phone.trim()) missing.push('WhatsApp number');
                  if (missing.length > 0) {
                    setError(`Complete these first: ${missing.join(', ')}`);
                    setMissingItems(missing);
                    return;
                  }
                  setError('');
                  setMissingItems([]);
                  setCheckoutScreen(2);
                  trackFunnelStep('checkout_view', { plan: plan.slug, screen: 'verify_pay' });
                }}
              >
                Continue to pay
              </button>
            </div>

            {!isTrialCheckout && (
              <div style={{ marginTop: 28 }}>
                <CheckoutTransformationCarousel />
              </div>
            )}
          </>
        )}

        {checkoutScreen === 2 && (
          <>
            <button
              type="button"
              onClick={() => { setCheckoutScreen(1); setError(''); }}
              style={styles.backToDetails}
            >
              ← Edit plan & details
            </button>

            <section style={{ ...styles.orderSummary, marginBottom: 16 }}>
              <div style={styles.orderRow}>
                <div>
                  <div style={styles.orderPlanName}>
                    {isTrialCheckout
                      ? plan.name
                      : `${planGoalName(plan.slug)} · ${planDurationLabel(plan.slug)}`}
                  </div>
                  <div style={styles.orderPlanMeta}>{email.trim() || '—'}</div>
                </div>
                <div style={styles.orderPriceCol}>
                  {!isTrialCheckout && <s style={styles.orderSummaryMrp}>{priceMrp}</s>}
                  <span style={styles.orderSummaryPrice}>
                    {isTrialCheckout ? plan.displayPrice : payableDisplay}
                  </span>
                </div>
              </div>
            </section>

            {testMode && (
              <div style={styles.testBanner}>
                Development mode — payment will be simulated. No Razorpay charge.
              </div>
            )}

            {error && <div style={styles.error}>{error}</div>}
            {isTrialCheckout && error && /trial|already used|renewal|new customers/i.test(error) && (
              <div style={styles.todoBox}>
                <p style={styles.todoTitle}>Upgrade instead</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {COACHING_PLAN_LIST.map((item) => (
                    <Link key={item.slug} href={`/checkout?plan=${item.slug}`} style={styles.validateBtn}>
                      {planGoalName(item.slug)} · {item.displayPrice}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {attemptedPay && liveMissing.length > 0 && (
              <div style={styles.todoBox}>
                <p style={styles.todoTitle}>Finish these to pay</p>
                <ul style={styles.todoList}>
                  {liveMissing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {missingItems.length > 0 && error && (
              <ul style={styles.missingList}>
                {missingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}

            <form id="checkout-pay-form" onSubmit={handleSubmit} style={styles.form} noValidate>
              {!testMode && (
                <div ref={verifyRef} style={styles.otpBox}>
                  <div style={styles.otpHead}>
                    <span style={styles.otpTitle}>Email verification</span>
                    <span
                      style={{
                        ...styles.otpStatusPill,
                        ...(emailVerified ? styles.otpStatusOk : null),
                      }}
                    >
                      {emailVerified ? 'Verified' : emailLinkSent ? 'Link sent' : 'Required'}
                    </span>
                  </div>
                  <p style={styles.otpHint}>
                    We email a secure link — open it on this device, then continue.
                  </p>
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

              <label
                ref={policyRef}
                style={styles.policyRow}
              >
                <input
                  type="checkbox"
                  checked={policyAgreementAccepted}
                  onChange={(event) => setPolicyAgreementAccepted(event.target.checked)}
                  aria-describedby="checkout-policy-agreement"
                  style={styles.policyCheck}
                />
                <span id="checkout-policy-agreement" style={styles.policyText}>
                  I agree to the{' '}
                  <Link href="/terms" target="_blank" style={styles.inlineLink}>
                    Terms &amp; Conditions
                  </Link>
                  . All guarantees, refunds, upgrades, and service rules are only as stated there.
                </span>
              </label>

              <div style={{ height: 88 }} aria-hidden />
            </form>

            <p style={styles.secure}>
              After payment you&apos;ll create your login password.
              {' '}
              <Link href="/create-account" style={styles.inlineLink}>Already paid?</Link>
              {' · '}
              <Link href="/enroll" style={styles.inlineLink}>Enrollment code</Link>
            </p>
          </>
        )}
      </div>

      {checkoutScreen === 2 && (
        <div style={styles.stickyPayBar}>
          <div style={styles.stickyPayInner}>
            <div style={styles.stickyPayMeta}>
              <span style={styles.stickyPayLabel}>Total due</span>
              <strong style={styles.stickyPayAmount}>{payableDisplay}</strong>
            </div>
            <button
              type="submit"
              form="checkout-pay-form"
              disabled={loading}
              style={styles.stickyPayBtn}
            >
              {loading ? 'Processing…' : `Pay ${payableDisplay}`}
            </button>
          </div>
          <p style={styles.stickyPayNote}>Secure checkout via Razorpay · SSL encrypted</p>
        </div>
      )}

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
    backgroundImage:
      'radial-gradient(ellipse 90% 50% at 50% -10%, rgba(249,115,22,0.14), transparent 55%)',
    padding: `${spacing[5]}px ${spacing[2]}px ${spacing[7]}px`,
    overflowX: 'hidden',
    boxSizing: 'border-box',
  },
  pageWithSticky: {
    paddingBottom: 120,
  },
  screenDots: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
  },
  screenDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.borderSubtle,
  },
  screenDotActive: {
    backgroundColor: colors.accent,
    width: 22,
  },
  backToDetails: {
    background: 'none',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    padding: '0 0 16px',
    minHeight: 36,
  },
  stickyPayBar: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    padding: `10px ${spacing[2]}px calc(10px + env(safe-area-inset-bottom))`,
    backgroundColor: 'rgba(9,9,11,0.92)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
  stickyPayInner: {
    maxWidth: 480,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  stickyPayMeta: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    flex: 1,
  },
  stickyPayLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  stickyPayAmount: {
    fontSize: 18,
    fontWeight: 800,
    color: colors.textPrimary,
  },
  stickyPayBtn: {
    flex: '1 1 auto',
    maxWidth: 220,
    padding: '14px 18px',
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
    minHeight: 52,
  },
  stickyPayNote: {
    maxWidth: 480,
    margin: '6px auto 0',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center' as const,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: `${spacing[4]}px ${spacing[3]}px ${spacing[5]}px`,
    border: `1px solid ${colors.borderSubtle}`,
    boxSizing: 'border-box',
    boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
  },
  backLink: {
    display: 'inline-block',
    color: colors.textMuted,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 16,
  },
  brandMark: {
    margin: '0 0 6px',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: colors.accent,
  },
  title: {
    margin: '0 0 8px',
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.15,
  },
  subtitle: {
    margin: '0 0 22px',
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 1.45,
  },
  trustStrip: {
    margin: '0 0 18px',
    padding: '12px 14px',
    borderRadius: radius.sm,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
  },
  trustBadges: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginBottom: 10,
  },
  trustBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 8,
    border: `1px solid ${colors.borderSubtle}`,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  trustLine: {
    margin: '0 0 6px',
    fontSize: 13,
    lineHeight: 1.45,
    color: colors.textSecondary,
  },
  trustLineMuted: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.4,
    color: colors.textMuted,
  },
  planPicker: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 16,
  },
  planChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '12px 8px',
    borderRadius: radius.sm,
    border: `1px solid ${colors.borderSubtle}`,
    textDecoration: 'none',
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    textAlign: 'center' as const,
    minWidth: 0,
  },
  planChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
    boxShadow: `0 0 0 1px ${colors.accent}`,
  },
  planChipName: {
    fontSize: 13,
    fontWeight: 800,
    color: colors.textPrimary,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  planChipDuration: {
    fontSize: 10,
    fontWeight: 650,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    marginTop: 1,
  },
  planChipPrice: {
    fontSize: 15,
    fontWeight: 800,
    color: colors.textPrimary,
  },
  planChipMrp: {
    fontSize: 11,
    color: colors.textMuted,
    textDecoration: 'line-through',
  },
  trialBadge: {
    marginBottom: 16,
    padding: '12px 14px',
    borderRadius: radius.sm,
    border: `1px solid ${colors.accent}`,
    backgroundColor: colors.accentMuted,
    color: colors.textPrimary,
    fontWeight: 700,
    fontSize: 14,
    textAlign: 'center' as const,
  },
  orderSummary: {
    margin: '0 0 12px',
    padding: 14,
    borderRadius: radius.md,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
  },
  orderRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderPlanName: {
    fontSize: 15,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  orderPlanMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 1.35,
  },
  orderPriceCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  orderSummaryPrice: {
    fontSize: 20,
    fontWeight: 800,
    color: colors.textPrimary,
    whiteSpace: 'nowrap' as const,
  },
  orderSummaryMrp: {
    fontSize: 12,
    fontWeight: 500,
    color: colors.textMuted,
  },
  offerBanner: {
    marginTop: 12,
    padding: 14,
    borderRadius: radius.sm,
    border: '1px solid rgba(249,115,22,0.45)',
    backgroundColor: colors.accentMuted,
  },
  offerBannerTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
    fontSize: 13,
    color: colors.textPrimary,
  },
  offerSave: {
    color: colors.accentHover,
    fontWeight: 700,
    fontSize: 12,
  },
  offerBannerText: {
    margin: '0 0 12px',
    fontSize: 13,
    lineHeight: 1.45,
    color: colors.textSecondary,
  },
  appliedCodeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  appliedCodeChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(249,115,22,0.55)',
    backgroundColor: 'rgba(249,115,22,0.16)',
    color: colors.accentHover,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.06em',
  },
  priceIncreaseTimer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    padding: '12px 14px',
    borderRadius: radius.sm,
    border: '1px solid rgba(249,115,22,0.55)',
    background:
      'linear-gradient(135deg, rgba(249,115,22,0.22), rgba(249,115,22,0.08))',
  },
  priceIncreaseLabel: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: colors.accentHover,
  },
  priceIncreaseValue: {
    fontSize: 18,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums' as const,
    letterSpacing: '0.04em',
    color: colors.textPrimary,
    minWidth: '5.8em',
    textAlign: 'right' as const,
  },
  leagueNote: {
    margin: '0 0 20px',
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  addonBlock: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTop: `1px dashed ${colors.borderSubtle}`,
  },
  addonRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing[3],
    cursor: 'pointer',
  },
  addonCheckbox: {
    width: 18,
    height: 18,
    marginTop: 2,
    flexShrink: 0,
    accentColor: colors.accent,
    cursor: 'pointer',
  },
  addonBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    minWidth: 0,
  },
  addonTitleRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  addonTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  addonPrice: {
    fontSize: 14,
    fontWeight: 800,
    color: colors.accent,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
  addonCopy: {
    fontSize: 12,
    lineHeight: 1.5,
    color: colors.textMuted,
  },
  addonTotalNote: {
    margin: `${spacing[2]}px 0 0 30px`,
    fontSize: 12,
    color: colors.textSecondary,
  },
  testBanner: {
    backgroundColor: colors.warningMuted,
    color: colors.warning,
    padding: spacing[2],
    borderRadius: radius.sm,
    marginBottom: spacing[3],
    fontSize: 13,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  sectionLabel: {
    margin: '8px 0 4px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  label: {
    fontWeight: 600,
    fontSize: 13,
    marginTop: 6,
    color: colors.textSecondary,
  },
  input: {
    padding: '13px 14px',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    fontSize: 16,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    minHeight: 52,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  },
  payBtn: {
    marginTop: 14,
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
  paySecureNote: {
    margin: '8px 0 0',
    textAlign: 'center' as const,
    fontSize: 12,
    color: colors.textMuted,
  },
  error: {
    backgroundColor: colors.dangerMuted,
    color: colors.danger,
    padding: spacing[2],
    borderRadius: radius.sm,
    marginBottom: spacing[2],
    fontSize: 14,
  },
  missingList: {
    margin: '0 0 12px',
    padding: '12px 12px 12px 28px',
    backgroundColor: colors.warningMuted,
    color: colors.warning,
    borderRadius: radius.sm,
    fontSize: 14,
    lineHeight: 1.45,
  },
  todoBox: {
    margin: '0 0 16px',
    padding: '14px 16px',
    backgroundColor: colors.accentMuted,
    border: '1px solid rgba(249,115,22,0.25)',
    borderRadius: radius.sm,
  },
  todoTitle: {
    margin: '0 0 8px',
    fontSize: 12,
    fontWeight: 700,
    color: colors.accent,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  todoList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 14,
    lineHeight: 1.5,
    color: colors.textSecondary,
  },
  secure: {
    marginTop: spacing[4],
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 1.5,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    color: colors.textSecondary,
    backgroundColor: colors.bgPrimary,
  },
  redeemBox: {
    marginTop: 10,
    marginBottom: 4,
  },
  redeemHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  redeemTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.textSecondary,
  },
  discountBadge: {
    flexShrink: 0,
    padding: '3px 8px',
    borderRadius: 999,
    backgroundColor: colors.successMuted,
    color: colors.success,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.04em',
  },
  codeRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  discountApplied: {
    marginTop: 10,
    padding: '10px 12px',
    borderRadius: radius.sm,
    backgroundColor: colors.successMuted,
    color: colors.success,
    fontSize: 13,
    lineHeight: 1.45,
  },
  validateBtn: {
    padding: '12px 16px',
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 48,
    whiteSpace: 'nowrap' as const,
    flex: '0 0 auto',
  },
  backToPay: {
    background: 'none',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: 13,
    padding: '4px 0',
    minHeight: 36,
    flexShrink: 0,
  },
  otpBox: {
    marginTop: 10,
    padding: 14,
    borderRadius: radius.sm,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  },
  otpHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  otpTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  otpStatusPill: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    padding: '4px 8px',
    borderRadius: 999,
    backgroundColor: colors.warningMuted,
    color: colors.warning,
  },
  otpStatusOk: {
    backgroundColor: colors.successMuted,
    color: colors.success,
  },
  otpDiscountApplied: {
    padding: '8px 10px',
    borderRadius: radius.sm,
    backgroundColor: colors.successMuted,
    color: colors.success,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  otpHint: {
    margin: 0,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
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
  policyRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 14,
  },
  policyCheck: {
    marginTop: 3,
    flexShrink: 0,
  },
  policyText: {
    fontSize: 12,
    lineHeight: 1.5,
    color: colors.textSecondary,
  },
  inlineLink: {
    color: colors.accent,
    fontWeight: 600,
  },
};
