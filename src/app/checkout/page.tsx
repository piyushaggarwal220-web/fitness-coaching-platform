'use client';

import { Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { BRAND_NAME } from '@/lib/brand';
import { planDurationLabel, planGoalName, planPathForSlug } from '@/lib/payments/plan-pages';
import {
 COACHING_PLAN_LIST,
 DIGITAL_PLAN_LIST,
 getPurchasablePlan,
 isDigitalPlanSlug,
 type CoachingPlanSlug,
} from '@/lib/payments/plans';
import { createClient } from '@/lib/supabase/client';
import { isPaymentBypassClient } from '@/lib/config';
import { resolveAuthEmailRedirectOrigin, resolveMarketingBaseUrl } from '@/lib/admin/portal-urls';
import { colors, spacing, radius } from '@/lib/design-tokens';
import { queueMetaPurchase } from '@/lib/analytics/meta-pixel';
import {
 persistMetaClickIdsFromLocation,
 readMetaBrowserIds,
} from '@/lib/analytics/meta-attribution';
import { trackFunnelStep } from '@/lib/analytics/funnel';
import {
 formatInrFromPaise,
 firstTimerSalePaise,
 discountPaiseForPlan,
 getFirstTimerDiscountCode,
 isFirstTimerDiscountCode,
 isRetiredPublicDiscountCode,
 isPublicSaleCode,
 publicSaleDiscountPaise,
 PUBLIC_SALE_CODE,
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
import { AnimatedTransformations } from '@/components/landing/AnimatedTransformations';
import { CheckoutBasicsStep, type CheckoutBasicsFormState } from '@/components/checkout/CheckoutBasicsStep';
import { validateCheckoutBasicsFields } from '@/lib/payments/checkout-intake-basics-shared';
import { isPublicDemoEmail } from '@/lib/public-demo';
import { leavePublicDemoSession } from '@/lib/public-demo-session';

const supabase = createClient();
const marketingBaseUrl = resolveMarketingBaseUrl();
const PAYMENT_SUCCESS_KEY = 'lurvox_checkout_success_redirect';
const CHECKOUT_DRAFT_KEY = 'lurvox_checkout_draft_v1';
type CheckoutScreen = 1 | 2 | 3 | 4;

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
 const rawPlan = searchParams.get('plan') ?? '3_months';
 const initialPlan = rawPlan === '1_week_trial' ? '3_months' : rawPlan;
 const codeFromUrlRaw = (searchParams.get('code') ?? '').trim().toUpperCase();
 const codeFromUrl = isRetiredPublicDiscountCode(codeFromUrlRaw) ? '' : codeFromUrlRaw;
 const plan = getPurchasablePlan(initialPlan) ?? getPurchasablePlan('3_months')!;

 const [name, setName] = useState('');
 const [email, setEmail] = useState('');
 const [phone, setPhone] = useState('');
 const [loading, setLoading] = useState(false);
 const [paymentConfirmed, setPaymentConfirmed] = useState(false);
 const [error, setError] = useState('');
 const [razorpayReady, setRazorpayReady] = useState(false);
 const [policyAgreementAccepted, setPolicyAgreementAccepted] = useState(false);
 const [verificationId, setVerificationId] = useState('');
 const [emailCode, setEmailCode] = useState('');
 const [emailVerified, setEmailVerified] = useState(false);
 const [emailDelivery, setEmailDelivery] = useState<'code' | 'magic_link' | null>(null);
 const [emailLinkSent, setEmailLinkSent] = useState(false);
 const [missingItems, setMissingItems] = useState<string[]>([]);
 const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
 const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);
 const welcomeCode = getFirstTimerDiscountCode();
 const [referralCode, setReferralCode] = useState(codeFromUrl);
 const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscountPreview | null>(null);
 const [saleCountdown, setSaleCountdown] = useState('08:00:00');
 const [applyingCode, setApplyingCode] = useState(false);
 const [enrollmentHref, setEnrollmentHref] = useState<string | null>(null);
 const [attemptedPay, setAttemptedPay] = useState(false);
 const [checkoutScreen, setCheckoutScreen] = useState<CheckoutScreen>(1);
 const [basicsComplete, setBasicsComplete] = useState(false);
 const [savingBasics, setSavingBasics] = useState(false);
 const [basics, setBasics] = useState<CheckoutBasicsFormState>({
 age: '',
 gender: '',
 heightCm: '',
 weightKg: '',
 dietPreference: '',
 mainGoal: '',
 });
 const [demoHandoff, setDemoHandoff] = useState(false);
 const paymentSucceededRef = useRef(false);
 const autoApplyKeyRef = useRef('');
 const nameRef = useRef<HTMLInputElement>(null);
 const emailRef = useRef<HTMLInputElement>(null);
 const phoneRef = useRef<HTMLInputElement>(null);
 const policyRef = useRef<HTMLLabelElement>(null);
 const verifyRef = useRef<HTMLDivElement>(null);
 const testMode = isPaymentBypassClient();
 const isTrialCheckout = plan.isTrial === true;
 const isDigitalCheckout = plan.isDigital === true || isDigitalPlanSlug(plan.slug);
 const planPickerList = isDigitalCheckout ? DIGITAL_PLAN_LIST : COACHING_PLAN_LIST;
 const planPayablePaise = appliedDiscount?.amountPaise ?? plan.amountPaise;
 const payablePaise = planPayablePaise;
 const payableDisplay = formatInrFromPaise(payablePaise);
 const firstTimerPreviewPaise = firstTimerSalePaise(plan.slug);
 const firstTimerPreviewDisplay =
 firstTimerPreviewPaise != null ? formatInrFromPaise(firstTimerPreviewPaise) : plan.displayPrice;
 const firstTimerSavingsPaise =
 firstTimerPreviewPaise != null ? plan.amountPaise - firstTimerPreviewPaise : null;

 useEffect(() => {
 let cancelled = false
 void (async () => {
 const { data } = await supabase.auth.getUser()
 if (!isPublicDemoEmail(data.user?.email)) return
 setDemoHandoff(true)
 await leavePublicDemoSession()
 if (!cancelled) setDemoHandoff(false)
 })()
 return () => {
 cancelled = true
 }
 }, [])

 useEffect(() => {
 setEnrollmentHref(null);
 autoApplyKeyRef.current = '';
 if (isTrialCheckout || isDigitalCheckout) {
 setReferralCode('');
 setAppliedDiscount(null);
 } else if (codeFromUrl) {
 setReferralCode(codeFromUrl);
 } else {
 setReferralCode((prev) => prev);
 }
 }, [plan.slug, isTrialCheckout, isDigitalCheckout, codeFromUrl, welcomeCode]);

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
 message: `Referral applied - save ${formatInrFromPaise(discountPaise)} on ${plan.name} (sale + ${affiliate.extraPercentOffSale}% via ${affiliate.referrerLabel}).`,
 };
 }

 if (isPublicSaleCode(code)) {
 const discountPaise = publicSaleDiscountPaise(plan.amountPaise);
 if (discountPaise == null) return null;
 return {
 code: PUBLIC_SALE_CODE,
 discountPaise,
 amountPaise: plan.amountPaise - discountPaise,
 listAmountPaise: plan.amountPaise,
 displayListPrice: plan.displayPrice,
 displaySalePrice: formatInrFromPaise(plan.amountPaise - discountPaise),
 displayDiscount: formatInrFromPaise(discountPaise),
 message: `Discount applied - save ${formatInrFromPaise(discountPaise)} on ${plan.name}.`,
 };
 }

 if (isRetiredPublicDiscountCode(code) || !isFirstTimerDiscountCode(code)) return null;
 const discountPaise = discountPaiseForPlan(plan.slug, plan.amountPaise);
 const amountPaise = firstTimerSalePaise(plan.slug, plan.amountPaise);
 if (discountPaise == null || amountPaise == null || discountPaise <= 0) return null;
 return {
 code: getFirstTimerDiscountCode(),
 discountPaise,
 amountPaise,
 listAmountPaise: plan.amountPaise,
 displayListPrice: plan.displayPrice,
 displaySalePrice: formatInrFromPaise(amountPaise),
 displayDiscount: formatInrFromPaise(discountPaise),
 message: `Discount applied - save ${formatInrFromPaise(discountPaise)} on ${plan.name}.`,
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

 // Instant local apply for SUMMER60 / LUKE - no email required.
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
 // Eligibility failed (invalid code, etc.) - drop the preview discount when email is known.
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
 if (isTrialCheckout || isDigitalCheckout || applyingCode) return;
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
 }, [email, referralCode, plan.slug, isTrialCheckout, isDigitalCheckout]);

 const clearReferralCode = () => {
 setReferralCode('');
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
 try {
 const raw = sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
 if (!raw) return;
 const draft = JSON.parse(raw) as {
 name?: string;
 email?: string;
 phone?: string;
 verificationId?: string;
 basics?: CheckoutBasicsFormState;
 basicsComplete?: boolean;
 };
 if (draft.name && !name) setName(draft.name);
 if (draft.email && !email) setEmail(draft.email);
 if (draft.phone && !phone) setPhone(draft.phone);
 if (draft.verificationId && !verificationId) setVerificationId(draft.verificationId);
 if (draft.basics) setBasics((prev) => ({ ...prev, ...draft.basics }));
 if (draft.basicsComplete) setBasicsComplete(true);
 } catch {
 // ignore
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
 }, []);

 useEffect(() => {
 try {
 sessionStorage.setItem(
 CHECKOUT_DRAFT_KEY,
 JSON.stringify({
 name,
 email,
 phone,
 verificationId,
 basics,
 basicsComplete,
 })
 );
 } catch {
 // ignore
 }
 }, [name, email, phone, verificationId, basics, basicsComplete]);

 useEffect(() => {
 const vid = searchParams.get('vid')?.trim() ?? '';
 const verified = searchParams.get('emailVerified') === '1';
 if (vid) setVerificationId(vid);
 if (verified && vid) {
 setEmailVerified(true);
 setEmailLinkSent(true);
 setEmailDelivery('magic_link');
 setCheckoutScreen(3);
 }
 }, [searchParams]);

 useEffect(() => {
 if (!verificationId || !emailVerified) return;
 let cancelled = false;
 void (async () => {
 try {
 const statusRes = await fetch(
 `/api/payment/verification-status?verificationId=${encodeURIComponent(verificationId)}`
 );
 const statusData = await statusRes.json();
 if (!cancelled && statusData.email) setEmail(statusData.email);
 if (!cancelled && statusData.phone && !phone.trim()) setPhone(statusData.phone);

 const basicsRes = await fetch(
 `/api/payment/checkout-basics?verificationId=${encodeURIComponent(verificationId)}`
 );
 const basicsData = await basicsRes.json();
 if (cancelled) return;
 if (basicsData.complete && basicsData.basics) {
 setBasics({
 age: String(basicsData.basics.age ?? ''),
 gender: basicsData.basics.gender ?? '',
 heightCm: String(basicsData.basics.heightCm ?? ''),
 weightKg:
 basicsData.basics.weightKg == null ? '' : String(basicsData.basics.weightKg),
 dietPreference: basicsData.basics.dietPreference ?? '',
 mainGoal: basicsData.basics.mainGoal ?? '',
 });
 setBasicsComplete(true);
 if (basicsData.basics.name && !name.trim()) setName(basicsData.basics.name);
 setCheckoutScreen((current) => (current < 4 ? 4 : current));
 }
 } catch {
 // ignore restore errors
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [verificationId, emailVerified]); // eslint-disable-line react-hooks/exhaustive-deps

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
 : 'Verify your email (tap "Send verification email")'
 );
 }
 if (!testMode && !basicsComplete) {
 missing.push('Answer the quick intake basics');
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
 // Always use the public app origin - never localhost (emails open on other devices).
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

 const saveBasicsAndContinue = async () => {
 setError('');
 setSavingBasics(true);
 try {
 let activeVerificationId = verificationId;
 if (testMode && !activeVerificationId) {
 const res = await fetch('/api/payment/send-otp', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 channel: 'email',
 email,
 phone,
 name,
 }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Could not start checkout session');
 activeVerificationId = data.verificationId;
 setVerificationId(data.verificationId);
 setEmailVerified(true);
 }

 const res = await fetch('/api/payment/checkout-basics', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 verificationId: activeVerificationId,
 email,
 phone,
 name,
 planSlug: plan.slug,
 age: basics.age,
 gender: basics.gender,
 heightCm: basics.heightCm,
 weightKg: basics.weightKg || null,
 dietPreference: basics.dietPreference,
 mainGoal: basics.mainGoal,
 }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Could not save basics');
 setBasicsComplete(true);
 setCheckoutScreen(4);
 trackFunnelStep('checkout_view', { plan: plan.slug, screen: 'paywall' });
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Could not save basics');
 } finally {
 setSavingBasics(false);
 }
 };

 const continueFromBasics = () => {
 const validated = validateCheckoutBasicsFields(basics);
 if (!validated.ok) {
 setError(validated.error);
 return;
 }
 setError('');
 setCheckoutScreen(2);
 trackFunnelStep('checkout_view', { plan: plan.slug, screen: 'details' });
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
 const metaIds = { ...readMetaBrowserIds(), ...(() => {
 persistMetaClickIdsFromLocation()
 return readMetaBrowserIds()
 })() }
 const verifyRes = await fetch('/api/payment/verify', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 planSlug: plan.slug,
 email,
 name,
 phone,
 meta_fbp: metaIds.fbp,
 meta_fbc: metaIds.fbc,
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
 ...(() => {
 persistMetaClickIdsFromLocation()
 const ids = readMetaBrowserIds()
 return {
 ...(ids.fbp ? { meta_fbp: ids.fbp } : {}),
 ...(ids.fbc ? { meta_fbc: ids.fbc } : {}),
 }
 })(),
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
 <Link href={marketingBaseUrl} style={styles.backLink}><- Back to home</Link>
 <p style={styles.brandMark}>{BRAND_NAME}</p>
 <h1 style={styles.title}>Payment confirmed</h1>
 <p style={styles.subtitle}>Taking you to create your login password...</p>
 </div>
 </div>
 );
 }

 if (demoHandoff) {
 return (
 <div style={styles.page}>
 <div style={styles.card}>
 <p style={styles.brandMark}>{BRAND_NAME}</p>
 <h1 style={styles.title}>Opening checkout</h1>
 <p style={styles.subtitle}>Leaving the demo so you can pay with your own details.</p>
 </div>
 </div>
 )
 }

 const pricePrimary = appliedDiscount?.displaySalePrice ?? plan.displayPrice;
 const priceMrp = appliedDiscount?.displayListPrice ?? plan.displayPrice;
 const discountLockedIn = Boolean(appliedDiscount);
 const showListStrike =
 !isTrialCheckout && (discountLockedIn || planPayablePaise < plan.amountPaise);
 const offerSaveDisplay =
 appliedDiscount?.displayDiscount
 ?? (firstTimerSavingsPaise != null && firstTimerSavingsPaise > 0
 ? formatInrFromPaise(firstTimerSavingsPaise)
 : null);

 const dig = (base: CSSProperties, key?: keyof typeof digitalTheme): CSSProperties =>
 isDigitalCheckout && key ? { ...base, ...digitalTheme[key] } : base

 return (
 <div
 style={{
 ...styles.page,
 ...(checkoutScreen === 4 ? styles.pageWithSticky : null),
 ...(isDigitalCheckout ? digitalTheme.page : null),
 }}
 >
 <div style={{ ...styles.card, ...(isDigitalCheckout ? digitalTheme.card : null) }}>
 <Link
 href={isDigitalCheckout ? '/customised-plan' : marketingBaseUrl}
 style={dig(styles.backLink, 'backLink')}
 >
 <- {isDigitalCheckout ? 'Back to plans' : 'Back to home'}
 </Link>

 <p style={{ ...styles.brandMark, ...(isDigitalCheckout ? digitalTheme.brandMark : null) }}>
 {BRAND_NAME}
 </p>
 {isDigitalCheckout ? (
 <p style={digitalTheme.eyebrow}>PERSONALISED FITNESS PLANS</p>
 ) : null}
 <h1 style={{ ...styles.title, ...(isDigitalCheckout ? digitalTheme.title : null) }}>
 {isTrialCheckout
 ? 'Start your 7-day trial'
 : isDigitalCheckout
 ? 'Start your customised plan'
 : 'Start your coaching intake'}
 </h1>
 <p style={dig(styles.subtitle, 'subtitle')}>
 {checkoutScreen === 1
 ? 'Answer a few basics so we can customize your coaching.'
 : checkoutScreen === 2
 ? (isTrialCheckout
 ? 'Full coaching access for 7 days. Upgrade anytime.'
 : 'Enter your details to continue intake - payment comes after.')
 : checkoutScreen === 3
 ? 'Verify your email to save your answers and continue.'
 : 'Unlock your customized plan and pay securely.'}
 </p>

 <div style={styles.screenDots} aria-label={`Checkout step ${checkoutScreen} of 4`}>
 {([1, 2, 3, 4] as CheckoutScreen[]).map((step) => (
 <span
 key={step}
 style={{
 ...styles.screenDot,
 ...(checkoutScreen === step ? styles.screenDotActive : null),
 ...(isDigitalCheckout && checkoutScreen === step ? digitalTheme.dotActive : null),
 }}
 />
 ))}
 </div>

 {checkoutScreen === 1 && (
 <CheckoutBasicsStep
 value={basics}
 onChange={setBasics}
 onBack={() => {
 const planHref = isDigitalCheckout
 ? '/customised-plan'
 : `/plans/${planPathForSlug(plan.slug as CoachingPlanSlug)}`;
 window.location.href = planHref;
 }}
 onSubmit={continueFromBasics}
 saving={false}
 error={error}
 styles={styles}
 dig={dig}
 />
 )}

 {checkoutScreen === 2 && (
 <>
 <button
 type="button"
 onClick={() => { setCheckoutScreen(1); setError(''); }}
 style={dig(styles.backToDetails, 'backLink')}
 >
 <- Edit basics
 </button>

 {!isTrialCheckout && (
 <div style={styles.planPicker} role="tablist" aria-label="Choose plan">
 {planPickerList.map((item) => {
 const selected = item.slug === plan.slug;
 return (
 <Link
 key={item.slug}
 href={`/checkout?plan=${item.slug}${!isDigitalCheckout && referralCode ? `&code=${encodeURIComponent(referralCode)}` : ''}`}
 role="tab"
 aria-selected={selected}
 onClick={() =>
 trackFunnelStep('checkout_plan_switch', {
 plan: item.slug,
 plan_name: item.name,
 value: item.amountPaise / 100,
 })
 }
 style={{
 ...styles.planChip,
 ...(selected ? styles.planChipSelected : null),
 ...(isDigitalCheckout ? digitalTheme.planChip : null),
 ...(isDigitalCheckout && selected ? digitalTheme.planChipSelected : null),
 }}
 >
 <span style={dig(styles.planChipName, 'planChipName')}>
 {isDigitalCheckout ? item.name.replace('Complete Guidance', 'Complete') : planGoalName(item.slug)}
 </span>
 <span style={dig(styles.planChipDuration, 'planChipDuration')}>
 {isDigitalCheckout ? item.saveLabel : planDurationLabel(item.slug)}
 </span>
 <span style={dig(styles.planChipPrice, 'planChipPrice')}>{item.displayPrice}</span>
 {item.popular ? (
 <span style={isDigitalCheckout ? digitalTheme.planChipPopular : styles.planChipMrp}>
 Most popular
 </span>
 ) : null}
 {item.best ? <span style={styles.planChipMrp}>Best value</span> : null}
 </Link>
 );
 })}
 </div>
 )}

 {isTrialCheckout && (
 <div style={styles.trialBadge}>
 {plan.name} · {plan.displayPrice}
 </div>
 )}

 <section style={dig(styles.orderSummary, 'orderSummary')}>
 <div style={styles.orderRow}>
 <div>
 <div style={dig(styles.orderPlanName, 'orderPlanName')}>
 {isTrialCheckout
 ? `${plan.name} coaching`
 : isDigitalCheckout
 ? plan.name
 : `${planGoalName(plan.slug)} · ${planDurationLabel(plan.slug)}`}
 </div>
 <div style={dig(styles.orderPlanMeta, 'orderPlanMeta')}>
 {isDigitalCheckout
 ? plan.sections === 'workout'
 ? 'Workout guidance · digital delivery'
 : plan.sections === 'diet'
 ? 'Diet chart · digital delivery'
 : 'Workout Rs 49 · Diet Rs 89 · both Rs 99'
 : 'Basics done · next: your contact details'}
 </div>
 </div>
 <div style={styles.orderPriceCol}>
 {showListStrike ? <s style={styles.orderSummaryMrp}>{priceMrp}</s> : null}
 <span style={dig(styles.orderSummaryPrice, 'orderSummaryPrice')}>
 {isTrialCheckout || isDigitalCheckout
 ? plan.displayPrice
 : formatInrFromPaise(planPayablePaise)}
 </span>
 </div>
 </div>
 </section>

 <p style={styles.leagueNote}>
 {isTrialCheckout
 ? 'Once per person. Includes coach chat, personal plan, trackers, and check-ins.'
 : isDigitalCheckout
 ? 'After payment, finish the remaining intake questions and receive your plan on the platform.'
 : plan.slug === '12_months'
 ? 'Weekly coach phone call included. 12 month exclusive.'
 : 'Personal workout, diet, coach chat, and weekly check-ins are included.'}
 </p>

 {error && <div style={styles.error}>{error}</div>}

 <div style={styles.form}>
 <h2 style={dig(styles.sectionLabel, 'sectionLabel')}>Your details</h2>

 <label style={dig(styles.label, 'label')} htmlFor="checkout-name">Full name</label>
 <input
 id="checkout-name"
 ref={nameRef}
 value={name}
 onChange={(e) => setName(e.target.value)}
 autoComplete="name"
 style={dig(styles.input, 'input')}
 />

 <label style={dig(styles.label, 'label')} htmlFor="checkout-email">Email</label>
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
 style={dig(styles.input, 'input')}
 />

 <label style={dig(styles.label, 'label')} htmlFor="checkout-phone">WhatsApp number</label>
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
 style={dig(styles.input, 'input')}
 />

 <button
 type="button"
 style={dig(styles.payBtn, 'payBtn')}
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
 setCheckoutScreen(3);
 trackFunnelStep('checkout_view', { plan: plan.slug, screen: 'verify' });
 }}
 >
 Continue to verify email
 </button>
 </div>
 </>
 )}

 {checkoutScreen === 3 && (
 <>
 <button
 type="button"
 onClick={() => { setCheckoutScreen(2); setError(''); }}
 style={dig(styles.backToDetails, 'backLink')}
 >
 <- Edit details
 </button>

 <section style={{ ...dig(styles.orderSummary, 'orderSummary'), marginBottom: 16 }}>
 <div style={styles.orderRow}>
 <div>
 <div style={dig(styles.orderPlanName, 'orderPlanName')}>
 {isTrialCheckout
 ? plan.name
 : isDigitalCheckout
 ? plan.name
 : `${planGoalName(plan.slug)} · ${planDurationLabel(plan.slug)}`}
 </div>
 <div style={dig(styles.orderPlanMeta, 'orderPlanMeta')}>{email.trim() || ' - '}</div>
 </div>
 <div style={styles.orderPriceCol}>
 {showListStrike ? <s style={styles.orderSummaryMrp}>{priceMrp}</s> : null}
 <span style={dig(styles.orderSummaryPrice, 'orderSummaryPrice')}>
 {isTrialCheckout || isDigitalCheckout
 ? plan.displayPrice
 : formatInrFromPaise(planPayablePaise)}
 </span>
 </div>
 </div>
 </section>

 {testMode && (
 <div style={styles.testBanner}>
 Development mode - payment will be simulated. No Razorpay charge.
 </div>
 )}

 {error && <div style={styles.error}>{error}</div>}

 <div style={styles.form}>
 {!testMode && (
 <div ref={verifyRef} style={dig(styles.otpBox, 'otpBox')}>
 <div style={styles.otpHead}>
 <span style={dig(styles.otpTitle, 'otpTitle')}>Email verification</span>
 <span
 style={{
 ...styles.otpStatusPill,
 ...(emailVerified ? styles.otpStatusOk : null),
 }}
 >
 {emailVerified ? 'Verified' : emailLinkSent ? 'Link sent' : 'Required'}
 </span>
 </div>
 <p style={dig(styles.otpHint, 'otpHint')}>
 We email a secure link. Open it on this device, then continue.
 </p>
 <div style={styles.otpBtnRow}>
 <button
 type="button"
 onClick={() => void sendEmailOtp()}
 disabled={sendingEmailOtp || emailVerified || !email.trim() || !phone.trim()}
 style={dig(styles.otpBtn, 'otpBtn')}
 >
 {sendingEmailOtp
 ? 'Sending...'
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
 style={dig(styles.otpBtnSecondary, 'otpBtnSecondary')}
 >
 I've opened the link
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
 style={dig(styles.otpInput, 'otpInput')}
 />
 <button
 type="button"
 onClick={() => void verifyEmailOtp()}
 disabled={verifyingEmailOtp || emailCode.length < 6 || !verificationId}
 style={dig(styles.otpBtn, 'otpBtn')}
 >
 {verifyingEmailOtp ? 'Checking...' : 'Verify code'}
 </button>
 </>
 )}
 </div>
 )}

 <button
 type="button"
 style={dig(styles.payBtn, 'payBtn')}
 disabled={savingBasics || (!testMode && !emailVerified)}
 onClick={() => {
 if (!testMode && !emailVerified) {
 setError('Verify your email before continuing.');
 return;
 }
 void saveBasicsAndContinue();
 }}
 >
 {savingBasics ? 'Saving...' : 'Continue to unlock plan'}
 </button>
 </div>
 </>
 )}


 {checkoutScreen === 4 && (
 <>
 <button
 type="button"
 onClick={() => { setCheckoutScreen(3); setError(''); }}
 style={dig(styles.backToDetails, 'backLink')}
 >
 <- Back
 </button>

 {!isTrialCheckout && (
 <div style={dig(styles.trustStrip, 'trustStrip')} aria-label="Checkout trust">
 <div style={styles.trustBadges}>
 <span style={dig(styles.trustBadge, 'trustBadge')}>UPI</span>
 <span style={dig(styles.trustBadge, 'trustBadge')}>Cards</span>
 <span style={dig(styles.trustBadge, 'trustBadge')}>Netbanking</span>
 <span style={dig(styles.trustBadge, 'trustBadge')}>Razorpay Secure</span>
 </div>
 <p style={dig(styles.trustLine, 'trustLine')}>
 Secure checkout via Razorpay. By paying, you agree to our{' '}
 <Link href="/terms" target="_blank" style={dig(styles.inlineLink, 'inlineLink')}>
 Terms &amp; Conditions
 </Link>
 .
 </p>
 </div>
 )}

 <section style={{ ...dig(styles.orderSummary, 'orderSummary'), marginBottom: 16 }}>
 <div style={styles.orderRow}>
 <div>
 <div style={dig(styles.orderPlanName, 'orderPlanName')}>
 {isTrialCheckout
 ? plan.name
 : isDigitalCheckout
 ? plan.name
 : `${planGoalName(plan.slug)} · ${planDurationLabel(plan.slug)}`}
 </div>
 <div style={dig(styles.orderPlanMeta, 'orderPlanMeta')}>{email.trim() || ' - '}</div>
 </div>
 <div style={styles.orderPriceCol}>
 {showListStrike ? <s style={styles.orderSummaryMrp}>{priceMrp}</s> : null}
 <span style={dig(styles.orderSummaryPrice, 'orderSummaryPrice')}>
 {isTrialCheckout || isDigitalCheckout
 ? plan.displayPrice
 : formatInrFromPaise(planPayablePaise)}
 </span>
 </div>
 </div>
 </section>

 <h2 style={dig(styles.sectionLabel, 'sectionLabel')}>Unlock your customized plan</h2>
 <p style={dig(styles.otpHint, 'otpHint')}>
 You've answered the basics. To continue and get your full plan on the platform, pay for your plan.
 </p>
 <ul style={{ ...styles.todoList, marginBottom: 16 }}>
 <li>Full coaching intake after payment</li>
 <li>Customized diet chart, workout, cardio & sleep guidance</li>
 <li>Delivered on the {BRAND_NAME} platform</li>
 </ul>

 {testMode && (
 <div style={styles.testBanner}>
 Development mode - payment will be simulated. No Razorpay charge.
 </div>
 )}

 {error && <div style={styles.error}>{error}</div>}
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
 <label ref={policyRef} style={styles.policyRow}>
 <input
 type="checkbox"
 checked={policyAgreementAccepted}
 onChange={(event) => setPolicyAgreementAccepted(event.target.checked)}
 aria-describedby="checkout-policy-agreement"
 style={styles.policyCheck}
 />
 <span id="checkout-policy-agreement" style={dig(styles.policyText, 'policyText')}>
 I agree to the{' '}
 <Link href="/terms" target="_blank" style={dig(styles.inlineLink, 'inlineLink')}>
 Terms &amp; Conditions
 </Link>
 . All guarantees, refunds, upgrades, and service rules are only as stated there.
 </span>
 </label>
 <div style={{ height: 88 }} aria-hidden />
 </form>

 <p style={dig(styles.secure, 'secure')}>
 After payment you&apos;ll create your login password and continue intake.
 {' '}
 <Link href="/create-account" style={dig(styles.inlineLink, 'inlineLink')}>Already paid?</Link>
 {' · '}
 <Link href="/enroll" style={dig(styles.inlineLink, 'inlineLink')}>Enrollment code</Link>
 </p>
 </>
 )}
 </div>

 {checkoutScreen === 4 && (
 <div style={dig(styles.stickyPayBar, 'stickyPayBar')}>
 <div style={styles.stickyPayInner}>
 <div style={styles.stickyPayMeta}>
 <span style={dig(styles.stickyPayLabel, 'stickyPayLabel')}>Total due</span>
 <strong style={dig(styles.stickyPayAmount, 'stickyPayAmount')}>{payableDisplay}</strong>
 </div>
 <button
 type="submit"
 form="checkout-pay-form"
 disabled={loading}
 style={dig(styles.stickyPayBtn, 'stickyPayBtn')}
 >
 {loading ? 'Processing...' : `Pay ${payableDisplay}`}
 </button>
 </div>
 <p style={dig(styles.stickyPayNote, 'stickyPayNote')}>Secure checkout via Razorpay · SSL encrypted</p>
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

const digitalTheme: Record<string, CSSProperties> = {
 page: {
 backgroundColor: '#F4F8FF',
 backgroundImage:
 'radial-gradient(ellipse 90% 55% at 50% -15%, rgba(37,99,235,0.18), transparent 55%)',
 },
 card: {
 backgroundColor: '#FFFFFF',
 border: '1px solid rgba(37,99,235,0.14)',
 boxShadow: '0 18px 48px rgba(15,23,42,0.08)',
 },
 backLink: {
 color: '#64748B',
 },
 brandMark: {
 color: '#1D4ED8',
 },
 eyebrow: {
 margin: '0 0 8px',
 display: 'inline-flex',
 alignItems: 'center',
 padding: '6px 10px',
 borderRadius: 999,
 backgroundColor: 'rgba(37,99,235,0.12)',
 color: '#0F172A',
 fontSize: 11,
 fontWeight: 800,
 letterSpacing: '0.06em',
 },
 title: {
 color: '#0F172A',
 },
 subtitle: {
 color: '#475569',
 },
 dotActive: {
 backgroundColor: '#2563EB',
 },
 trustStrip: {
 backgroundColor: '#F8FBFF',
 border: '1px solid rgba(37,99,235,0.14)',
 },
 trustBadge: {
 backgroundColor: '#FFFFFF',
 border: '1px solid rgba(37,99,235,0.18)',
 color: '#334155',
 },
 trustLine: {
 color: '#475569',
 },
 planChip: {
 backgroundColor: '#F8FBFF',
 border: '1px solid rgba(37,99,235,0.18)',
 color: '#0F172A',
 },
 planChipSelected: {
 backgroundColor: '#EFF6FF',
 border: '2px solid #2563EB',
 boxShadow: 'none',
 },
 planChipName: {
 color: '#0F172A',
 },
 planChipDuration: {
 color: '#64748B',
 },
 planChipPrice: {
 color: '#0F172A',
 },
 planChipPopular: {
 fontSize: 11,
 fontWeight: 700,
 color: '#2563EB',
 textDecoration: 'none',
 },
 orderSummary: {
 backgroundColor: '#F8FBFF',
 border: '1px solid rgba(37,99,235,0.14)',
 },
 orderPlanName: {
 color: '#0F172A',
 },
 orderPlanMeta: {
 color: '#64748B',
 },
 orderSummaryPrice: {
 color: '#0F172A',
 },
 sectionLabel: {
 color: '#64748B',
 },
 label: {
 color: '#334155',
 },
 input: {
 backgroundColor: '#FFFFFF',
 border: '1px solid rgba(37,99,235,0.22)',
 color: '#0F172A',
 },
 payBtn: {
 backgroundColor: '#2563EB',
 color: '#FFFFFF',
 },
 paySecureNote: {
 color: '#64748B',
 },
 stickyPayBar: {
 backgroundColor: 'rgba(255,255,255,0.96)',
 borderTop: '1px solid rgba(37,99,235,0.16)',
 },
 stickyPayLabel: {
 color: '#64748B',
 },
 stickyPayAmount: {
 color: '#0F172A',
 },
 stickyPayBtn: {
 backgroundColor: '#2563EB',
 color: '#FFFFFF',
 },
 stickyPayNote: {
 color: '#64748B',
 },
 secure: {
 color: '#64748B',
 },
 inlineLink: {
 color: '#2563EB',
 },
 otpBox: {
 backgroundColor: '#F8FBFF',
 border: '1px solid rgba(37,99,235,0.14)',
 },
 otpTitle: {
 color: '#0F172A',
 },
 otpHint: {
 color: '#64748B',
 },
 otpInput: {
 backgroundColor: '#FFFFFF',
 border: '1px solid rgba(37,99,235,0.22)',
 color: '#0F172A',
 },
 otpBtn: {
 backgroundColor: '#2563EB',
 color: '#FFFFFF',
 },
 otpBtnSecondary: {
 border: '1px solid rgba(37,99,235,0.22)',
 color: '#1D4ED8',
 backgroundColor: '#FFFFFF',
 },
 policyText: {
 color: '#475569',
 },
 honestNote: {
 margin: '12px 0 0',
 fontSize: 13,
 lineHeight: 1.45,
 color: '#475569',
 },
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
