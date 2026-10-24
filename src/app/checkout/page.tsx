'use client';

import { Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Inter, Manrope } from 'next/font/google';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { BRAND_NAME } from '@/lib/brand';
import { planDurationLabel, planGoalName } from '@/lib/payments/plan-pages';
import {
 COACHING_PLAN_LIST,
 DIGITAL_PLAN_LIST,
 DURATION_PLAN_LIST,
 getPurchasablePlan,
 isDigitalPlanSlug,
 isDurationOfferSlug,
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
import { PREVIEW7_AD_PATH, PREVIEW_AD_PATH, previewAdFunnelSource, previewAdLandingPath } from '@/lib/analytics/ad-landing';
import { isPreview7SaleCode, preview7PricedPlan } from '@/lib/payments/preview7-prices';
import { checkoutThemeForLanding } from '@/lib/payments/checkout-theme';
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
import { type CheckoutBasicsFormState } from '@/components/checkout/CheckoutBasicsStep';
import { isPublicDemoEmail } from '@/lib/public-demo';
import { leavePublicDemoSession } from '@/lib/public-demo-session';
import { loadRazorpayCheckout } from '@/lib/payments/load-razorpay';
import { normalizePhoneForWhatsApp } from '@/lib/phone';

const supabase = createClient();
const marketingBaseUrl = resolveMarketingBaseUrl();
const checkoutFont = Manrope({
 subsets: ['latin'],
 weight: ['400', '500', '600', '700', '800'],
 display: 'swap',
});
const studioFont = Inter({
 subsets: ['latin'],
 weight: ['400', '500', '600', '700'],
 display: 'swap',
});

const STOREFRONT_PLAN_CARDS: Record<string, { badge: string; duration: string; savings: string; footer: string }> = {
 '3_months': {
 badge: 'Debloat',
 duration: '90 DAYS',
 savings: '',
 footer: 'Best for: dropping fat fast and getting visibly leaner — real results in 90 days',
 },
 '6_months': {
 badge: '⭐ Most Popular',
 duration: '6 MONTHS',
    savings: 'Save ₹301 vs monthly rate',
 footer: 'Best for: losing fat while building muscle',
 },
 '12_months': {
 badge: 'Complete transformation',
 duration: '12 MONTHS',
    savings: 'Save ₹1,301 vs monthly rate',
 footer: 'Best for: building an athletic body — fat loss, muscle, and stamina. Testosterone protocol for men, hourglass for women.',
 },
};

const PAYMENT_SUCCESS_KEY = 'lurvox_checkout_success_redirect';
const CHECKOUT_DRAFT_KEY = 'lurvox_checkout_draft_v1';
type CheckoutScreen = 1 | 2 | 3;

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
 const adLandingPath = previewAdLandingPath(searchParams.get('landing'));
 const fontClass = adLandingPath === PREVIEW_AD_PATH
 ? `${checkoutFont.className} ${studioFont.className}`
 : checkoutFont.className;
 const adFunnel = adLandingPath
 ? { source: previewAdFunnelSource(adLandingPath), path: adLandingPath }
 : {};
 const rawPlan = searchParams.get('plan') ?? '3_months';
 const initialPlan = rawPlan === '1_week_trial' ? '3_months' : rawPlan;
 const codeFromUrlRaw = (searchParams.get('code') ?? '').trim().toUpperCase();
 const codeFromUrl =
 isRetiredPublicDiscountCode(codeFromUrlRaw) || isPreview7SaleCode(codeFromUrlRaw) ? '' : codeFromUrlRaw;
 const plan = preview7PricedPlan(
 getPurchasablePlan(initialPlan) ?? getPurchasablePlan('3_months')!,
 adLandingPath,
 );

 const [name, setName] = useState('');
 const [email, setEmail] = useState('');
 const [phone, setPhone] = useState('');
 const [loading, setLoading] = useState(false);
 const [paymentConfirmed, setPaymentConfirmed] = useState(false);
 const [error, setError] = useState('');
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
 const [checkoutScreen, setCheckoutScreen] = useState<CheckoutScreen>(3);
 const [basicsComplete, setBasicsComplete] = useState(false);
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
 const testMode = isPaymentBypassClient();
 const isTrialCheckout = plan.isTrial === true;
 const isDigitalCheckout = plan.isDigital === true || isDigitalPlanSlug(plan.slug);
 const storefrontCheckout =
 !adLandingPath && !isDigitalCheckout && !isTrialCheckout && !isDurationOfferSlug(plan.slug);
 const intakeTheme = checkoutThemeForLanding(storefrontCheckout ? PREVIEW7_AD_PATH : adLandingPath, {
 manrope: checkoutFont.style.fontFamily,
 inter: studioFont.style.fontFamily,
 });
 const planPickerList = (isDigitalCheckout
 ? DIGITAL_PLAN_LIST
 : isDurationOfferSlug(plan.slug)
 ? DURATION_PLAN_LIST
 : COACHING_PLAN_LIST).map((item) => preview7PricedPlan(item, adLandingPath));
 const coachingLadder =
 !isDigitalCheckout && !isTrialCheckout && !isDurationOfferSlug(plan.slug);
 const visiblePlans = coachingLadder
 ? planPickerList.filter((item) => item.durationMonths >= plan.durationMonths)
 : planPickerList;
 const planPayablePaise = appliedDiscount?.amountPaise ?? plan.amountPaise;
 const payablePaise = planPayablePaise;
 const payableDisplay = formatInrFromPaise(payablePaise);
 const firstTimerPreviewPaise = firstTimerSalePaise(plan.slug);
 const firstTimerPreviewDisplay =
 firstTimerPreviewPaise != null ? formatInrFromPaise(firstTimerPreviewPaise) : plan.displayPrice;
 const firstTimerSavingsPaise =
 firstTimerPreviewPaise != null ? plan.amountPaise - firstTimerPreviewPaise : null;

 useEffect(() => {
 const previousBackground = document.body.style.backgroundColor
 const previousColor = document.body.style.color
 const previousImage = document.body.style.backgroundImage
 const previousBodyOverflow = document.body.style.overflow
 const previousHtmlOverflow = document.documentElement.style.overflow
 const previousBodyMargin = document.body.style.margin
 const themeMeta = document.querySelector('meta[name="theme-color"]')
 const previousTheme = themeMeta?.getAttribute('content') ?? ''
 const pageColor = String(intakeTheme.page.backgroundColor ?? '')
 document.body.style.backgroundColor = pageColor
 document.body.style.color = String(intakeTheme.page.color ?? '')
 document.body.style.backgroundImage = String(intakeTheme.page.backgroundImage ?? 'none')
 if (storefrontCheckout) {
 document.body.style.overflow = 'hidden'
 document.body.style.margin = '0'
 document.documentElement.style.overflow = 'hidden'
 }
 if (themeMeta && pageColor) themeMeta.setAttribute('content', pageColor)
 return () => {
 document.body.style.backgroundColor = previousBackground
 document.body.style.color = previousColor
 document.body.style.backgroundImage = previousImage
 document.body.style.overflow = previousBodyOverflow
 document.body.style.margin = previousBodyMargin
 document.documentElement.style.overflow = previousHtmlOverflow
 if (themeMeta) themeMeta.setAttribute('content', previousTheme)
 }
 }, [
 adLandingPath,
 intakeTheme.page.backgroundColor,
 intakeTheme.page.backgroundImage,
 intakeTheme.page.color,
 storefrontCheckout,
 ])

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
 ...(adLandingPath ? { landingPath: adLandingPath } : {}),
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
 checkoutScreen?: number;
 };
 if (draft.name && !name) setName(draft.name);
 if (draft.email && !email) setEmail(draft.email);
 if (draft.phone && !phone) setPhone(draft.phone);
 if (draft.verificationId && !verificationId) setVerificationId(draft.verificationId);
 if (draft.basics) setBasics((prev) => ({ ...prev, ...draft.basics }));
 if (draft.basicsComplete) setBasicsComplete(true);
 setCheckoutScreen(3);
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
 checkoutScreen,
 })
 );
 } catch {
 // ignore
 }
 }, [name, email, phone, verificationId, basics, basicsComplete, checkoutScreen]);

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
 const sale = adLandingPath === PREVIEW7_AD_PATH ? null : firstTimerSalePaise(plan.slug);
 trackFunnelStep('checkout_view', {
 plan: plan.slug,
 plan_name: plan.name,
 value: (sale ?? plan.amountPaise) / 100,
 ...adFunnel,
 });
 }, [plan, testMode]);

 const getMissingRequirements = (): string[] => {
 const missing: string[] = [];
 if (!name.trim()) missing.push('Full name');
 if (!email.trim()) missing.push('Email');
 else if (!email.includes('@')) missing.push('A valid email address');
 if (!phone.trim()) missing.push('WhatsApp number');
 else if (!normalizePhoneForWhatsApp(phone)) {
 missing.push('A valid WhatsApp number (10-digit Indian mobile)');
 }
 return missing;
 };

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
 }${adLandingPath ? `&landing=${encodeURIComponent(adLandingPath)}` : ''}`;
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
 ...(adLandingPath ? { landingPath: adLandingPath } : {}),
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
 const checkoutVerificationId = verificationId;

 const sale = adLandingPath === PREVIEW7_AD_PATH ? null : firstTimerSalePaise(plan.slug);
 trackFunnelStep('pay_click', {
 plan: plan.slug,
 plan_name: plan.name,
 value: (appliedDiscount?.amountPaise ?? sale ?? plan.amountPaise) / 100,
 ...adFunnel,
 });

 const payPhone = normalizePhoneForWhatsApp(phone) ?? phone
 const orderRes = await fetch('/api/payment/create-order', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 planSlug: plan.slug,
 email,
 name,
 phone: payPhone,
 policyAgreementAccepted: true,
 verificationId: checkoutVerificationId && checkoutVerificationId !== 'saved'
 ? checkoutVerificationId
 : undefined,
 discountCode: appliedDiscount?.code || undefined,
 ...(() => {
 persistMetaClickIdsFromLocation()
 const ids = readMetaBrowserIds()
 return {
 ...(ids.fbp ? { meta_fbp: ids.fbp } : {}),
 ...(ids.fbc ? { meta_fbc: ids.fbc } : {}),
 ...(adLandingPath ? { landingPath: adLandingPath } : {}),
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

 await loadRazorpayCheckout();

 const rzp = new window.Razorpay({
 key: orderData.keyId,
 amount: orderData.amount,
 currency: orderData.currency,
 name: 'LURVOX',
 description: `${plan.name} coaching plan`,
 order_id: orderData.orderId,
 prefill: { name, email, contact: payPhone },
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
 <div className={fontClass} style={{ ...styles.page, ...intakeTheme.page }}>
 {adLandingPath === PREVIEW_AD_PATH ? (
 <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap" />
 ) : null}
 <div style={{ ...styles.card, ...intakeTheme.card }}>
 <Link href={marketingBaseUrl} style={{ ...styles.backLink, ...intakeTheme.backLink }}>{'<- Back to home'}</Link>
 <p style={{ ...styles.brandMark, ...intakeTheme.brandMark }}>{BRAND_NAME}</p>
 <h1 style={{ ...styles.title, ...intakeTheme.title }}>Payment received</h1>
 <p style={{ ...styles.subtitle, ...intakeTheme.subtitle }}>
 {plan.isDigital
 ? 'Next: set your password on the following screen. Then a short questionnaire. Your plan arrives within 1–2 hours. We email the same steps if you leave.'
 : 'Next: set your password on the following screen. Then a short setup with photos. Your plan arrives within 1–2 hours. We email the same steps if you leave.'}
 </p>
 </div>
 </div>
 );
 }

 if (demoHandoff) {
 return (
 <div className={fontClass} style={{ ...styles.page, ...intakeTheme.page }}>
 <div style={{ ...styles.card, ...intakeTheme.card }}>
 <p style={{ ...styles.brandMark, ...intakeTheme.brandMark }}>{BRAND_NAME}</p>
 <h1 style={{ ...styles.title, ...intakeTheme.title }}>Opening checkout</h1>
 <p style={{ ...styles.subtitle, ...intakeTheme.subtitle }}>Leaving the demo so you can pay with your own details.</p>
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

 const dig = (base: CSSProperties, key?: string): CSSProperties => {
 if (!key) return base
 const overlay = intakeTheme[key as keyof typeof intakeTheme]
 return overlay ? { ...base, ...overlay } : base
 }

 return (
 <div
 className={fontClass}
 style={{
 ...styles.page,
 ...intakeTheme.page,
 ...(storefrontCheckout ? styles.pageFit : null),
 }}
 >
 {adLandingPath === PREVIEW_AD_PATH ? (
 <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap" />
 ) : null}
 <div style={{ ...styles.card, ...intakeTheme.card, ...(storefrontCheckout ? styles.cardFit : null) }}>
 <Link
 href={isDigitalCheckout ? '/customised-plan' : (adLandingPath ?? marketingBaseUrl)}
 style={{ ...dig(styles.backLink, 'backLink'), ...(storefrontCheckout ? styles.backLinkFit : null) }}
 >
 {'<- '}{isDigitalCheckout ? 'Back to plans' : adLandingPath ? 'Back' : 'Back to home'}
 </Link>

 <p style={{ ...styles.brandMark, ...intakeTheme.brandMark }}>
 {BRAND_NAME}
 </p>
 {isDigitalCheckout ? (
 <p style={intakeTheme.eyebrow}>PERSONALISED FITNESS PLANS</p>
 ) : (
 <p style={{ ...intakeTheme.eyebrow, ...(storefrontCheckout ? { margin: '0 auto 4px' } : null) }}>CHECKOUT</p>
 )}
 <h1 style={{ ...styles.title, ...intakeTheme.title, ...(storefrontCheckout ? styles.titleFit : null) }}>
 {isTrialCheckout
 ? 'Start your 7-day trial'
 : isDigitalCheckout
 ? 'Start your customised plan'
 : 'Pay for your plan'}
 </h1>
 <p style={{ ...dig(styles.subtitle, 'subtitle'), ...(storefrontCheckout ? styles.subtitleFit : null) }}>
 All questions are asked after payment.
 </p>

 {checkoutScreen === 3 && (
 <>
 {!isTrialCheckout && (
 <div
 style={storefrontCheckout
 ? { ...styles.planRow, gridTemplateColumns: `repeat(${Math.max(visiblePlans.length, 1)}, minmax(0, 1fr))` }
 : styles.planPicker}
 role="tablist"
 aria-label="Choose plan"
 >
 {visiblePlans.map((item) => {
 const selected = item.slug === plan.slug;
 const card = STOREFRONT_PLAN_CARDS[item.slug];
 const monthly =
 item.durationMonths > 0
 ? `≈ ₹${Math.round(item.amountPaise / 100 / item.durationMonths).toLocaleString('en-IN')}/month`
 : '';
 const cardPrice = `₹${Math.round(item.amountPaise / 100).toLocaleString('en-IN')}`;
 return (
 <Link
 key={item.slug}
 href={`/checkout?plan=${item.slug}${!isDigitalCheckout && referralCode ? `&code=${encodeURIComponent(referralCode)}` : ''}${adLandingPath ? `&landing=${encodeURIComponent(adLandingPath)}` : ''}`}
 role="tab"
 aria-selected={selected}
 onClick={() =>
 trackFunnelStep('checkout_plan_switch', {
 plan: item.slug,
 plan_name: item.name,
 value: item.amountPaise / 100,
 ...adFunnel,
 })
 }
 style={{
 ...(storefrontCheckout ? styles.planTile : styles.planChip),
 ...(selected && !storefrontCheckout ? styles.planChipSelected : null),
 ...intakeTheme.planChip,
 ...(selected && !storefrontCheckout ? intakeTheme.planChipSelected : null),
 ...(storefrontCheckout
 ? {
 background: selected
 ? 'linear-gradient(180deg, rgba(255,98,0,0.22) 0%, rgba(255,255,255,0.05) 100%)'
 : 'rgba(255,255,255,0.03)',
 border: selected ? '2px solid #ff6200' : '1px solid rgba(255,255,255,0.14)',
 color: '#ffffff',
 }
 : null),
 }}
 >
 {storefrontCheckout ? (
 <>
 <span style={styles.planTileName}>{planGoalName(item.slug)}</span>
 <span style={styles.planTileDuration}>{card?.duration || planDurationLabel(item.slug)}</span>
 <span style={styles.planTilePrice}>{cardPrice}</span>
 {monthly ? <span style={styles.planTileMonthly}>{monthly}</span> : null}
 </>
 ) : (
 <>
 <span style={dig(styles.planChipName, 'planChipName')}>
 {isDigitalCheckout ? item.name.replace('Complete Guidance', 'Complete') : planGoalName(item.slug)}
 </span>
 <span style={dig(styles.planChipDuration, 'planChipDuration')}>
 {isDigitalCheckout ? item.saveLabel : planDurationLabel(item.slug)}
 </span>
 <span style={dig(styles.planChipPrice, 'planChipPrice')}>{item.displayPrice}</span>
 {item.popular ? (
 <span style={{ ...styles.planChipBadge, ...intakeTheme.planChipPopular }}>Most popular</span>
 ) : null}
 {item.best ? (
 <span style={{ ...styles.planChipBadge, ...styles.planChipBadgeBest, ...intakeTheme.planChipBest }}>
 Best value
 </span>
 ) : null}
 </>
 )}
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

 {!storefrontCheckout && (
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
 : isDurationOfferSlug(plan.slug)
 ? 'Diet chart, diet plan, workout plan, sleep, cardio, and supplement guidance'
 : null}
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
 )}

 {isTrialCheckout || isDigitalCheckout ? (
 <p style={{ ...styles.leagueNote, color: intakeTheme.paySecureNote.color }}>
 {isTrialCheckout
 ? 'Once per person. Includes coach chat, personal plan, trackers, and check-ins.'
 : 'After payment, finish the remaining intake questions and receive your plan on the platform.'}
 </p>
 ) : null}

 {error && (
 <div style={styles.error}>
 {error}
 {missingItems.length > 0 ? (
 <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
 {missingItems.map((item) => (
 <li key={item}>{item}</li>
 ))}
 </ul>
 ) : null}
 </div>
 )}

 <div style={{ ...styles.form, ...(storefrontCheckout ? styles.formFit : null) }}>
 <h2 style={{ ...dig(styles.sectionLabel, 'sectionLabel'), ...(storefrontCheckout ? styles.sectionLabelFit : null) }}>For payment</h2>

 <label style={{ ...dig(styles.label, 'label'), ...(storefrontCheckout ? styles.labelFit : null) }} htmlFor="checkout-name">Full name</label>
 <input
 id="checkout-name"
 ref={nameRef}
 value={name}
 onChange={(e) => setName(e.target.value)}
 autoComplete="name"
 style={{ ...dig(styles.input, 'input'), ...(storefrontCheckout ? styles.inputFit : null) }}
 />

 <label style={{ ...dig(styles.label, 'label'), ...(storefrontCheckout ? styles.labelFit : null) }} htmlFor="checkout-email">Email</label>
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
 style={{ ...dig(styles.input, 'input'), ...(storefrontCheckout ? styles.inputFit : null) }}
 />

 <label style={{ ...dig(styles.label, 'label'), ...(storefrontCheckout ? styles.labelFit : null) }} htmlFor="checkout-phone">WhatsApp number</label>
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
 style={{ ...dig(styles.input, 'input'), ...(storefrontCheckout ? styles.inputFit : null) }}
 />

 <button
 type="button"
 style={{ ...dig(styles.payBtn, 'payBtn'), ...(storefrontCheckout ? styles.payBtnFit : null) }}
 disabled={loading}
 onClick={() => {
 const missing: string[] = [];
 if (!name.trim()) missing.push('Full name');
 if (!email.trim() || !email.includes('@')) missing.push('Email');
 if (!phone.trim()) missing.push('WhatsApp number');
 if (missing.length > 0) {
 setError(`Complete these first: ${missing.join(', ')}`);
 setMissingItems(missing);
 return;
 }
 setError('');
 setMissingItems([]);
 void handleSubmit({ preventDefault() {} } as FormEvent);
 }}
 >
 {loading ? 'Starting checkout...' : `Pay ${formatInrFromPaise(planPayablePaise)}`}
 </button>
 <p style={{ ...dig(styles.secure, 'secure'), ...(storefrontCheckout ? styles.secureFit : null) }}>
 {storefrontCheckout
 ? <>Razorpay handles payment. Purchasing means you accept the{' '}
 <Link href="/terms" target="_blank" style={dig(styles.inlineLink, 'inlineLink')}>Terms</Link>
 . Onboarding starts after you pay.</>
 : <>
 Payment is handled by Razorpay. Purchasing means you accept the{' '}
 <Link href="/terms" target="_blank" style={dig(styles.inlineLink, 'inlineLink')}>
 Terms &amp; Conditions
 </Link>
 .{' '}
 {isDigitalCheckout
 ? 'Right after you pay: set your password, then a short questionnaire. Your plan arrives within 1–2 hours. If this page closes, we email those steps.'
 : isTrialCheckout
 ? 'Right after you pay: set your password, then a short setup with photos. Your plan arrives within 1–2 hours. If you leave to finish payment in another app, come back here. If this page closes, we email those steps.'
 : 'The onboarding form and progress photos come only after payment. Front, side, and back photos are required unless that form marks them optional.'}
 </>}
 </p>
 </div>
 </>
 )}
 </div>

 {!testMode && <Script src="https://checkout.razorpay.com/v1/checkout.js" />}
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
    minHeight: '100dvh',
    width: '100%',
    maxWidth: '100%',
    overflowX: 'hidden',
    backgroundColor: '#f4efe6',
    backgroundImage: 'none',
    color: '#1c1915',
    fontFamily: checkoutFont.style.fontFamily,
    padding: `${spacing[5]}px ${spacing[2]}px ${spacing[7]}px`,
    boxSizing: 'border-box',
  },
  pageFit: {
    height: '100dvh',
    maxHeight: '100dvh',
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '8px 12px',
  },
  cardFit: {
    maxWidth: 560,
    maxHeight: '100%',
    margin: '0 auto',
    padding: '12px 14px 10px',
    overflow: 'hidden',
  },
  backLinkFit: {
    marginBottom: 4,
  },
  titleFit: {
    margin: '0 0 4px',
    fontSize: 22,
    lineHeight: 1.1,
  },
  subtitleFit: {
    margin: '0 0 8px',
    fontSize: 12,
    lineHeight: 1.3,
  },
  formFit: {
    gap: 2,
  },
  sectionLabelFit: {
    margin: '0 0 2px',
  },
  labelFit: {
    marginTop: 4,
    fontSize: 12,
  },
  inputFit: {
    minHeight: 40,
    padding: '8px 12px',
  },
  payBtnFit: {
    marginTop: 8,
    minHeight: 44,
    padding: '10px 14px',
    fontSize: 16,
  },
  secureFit: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 1.35,
  },
  pageWithSticky: {
    paddingBottom: 120,
  },
  screenDots: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  screenDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 77, 61, 0.22)',
    flexShrink: 0,
  },
  screenDotActive: {
    backgroundColor: '#1e4d3d',
    width: 22,
  },
  backToDetails: {
    display: 'block',
    background: 'none',
    border: 'none',
    color: '#4e4942',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    padding: '0 0 16px',
    margin: '0 0 4px',
    minHeight: 36,
    textAlign: 'left' as const,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  stickyPayBar: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    padding: `10px ${spacing[2]}px calc(10px + env(safe-area-inset-bottom))`,
    backgroundColor: 'rgba(244, 239, 230, 0.96)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderTop: '1px solid rgba(28, 25, 21, 0.12)',
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
    color: '#6d675e',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  stickyPayAmount: {
    fontSize: 18,
    fontWeight: 800,
    color: '#1c1915',
  },
  stickyPayBtn: {
    flex: '1 1 auto',
    maxWidth: 220,
    padding: '14px 18px',
    backgroundColor: '#1e4d3d',
    color: '#f4efe6',
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
    color: '#6d675e',
    textAlign: 'center' as const,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    minWidth: 0,
    margin: '0 auto',
    backgroundColor: '#fffaf3',
    borderRadius: radius.lg,
    padding: `${spacing[4]}px ${spacing[3]}px ${spacing[5]}px`,
    border: '1px solid rgba(28, 25, 21, 0.12)',
    boxSizing: 'border-box',
    boxShadow: 'none',
    overflowX: 'hidden',
  },
  backLink: {
    display: 'inline-block',
    color: '#4e4942',
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
    color: '#1e4d3d',
    textAlign: 'center',
  },
  title: {
    margin: '0 0 8px',
    fontSize: 28,
    color: '#1c1915',
    textAlign: 'center',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.15,
  },
  subtitle: {
    margin: '0 0 18px',
    color: '#4e4942',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 1.45,
  },
  durationPoints: {
    listStyle: 'none',
    margin: '0 0 18px',
    padding: 0,
    display: 'grid',
    gap: 8,
    textAlign: 'left',
  },
  durationPoint: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  durationDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    flex: '0 0 7px',
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
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  planStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 16,
    width: '100%',
  },
  planRow: {
    display: 'grid',
    gap: 8,
    marginBottom: 10,
    width: '100%',
  },
  planTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 0,
    padding: '8px 6px',
    borderRadius: 12,
    textDecoration: 'none',
    textAlign: 'center' as const,
    boxSizing: 'border-box',
  },
  planTileName: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    color: '#ffffff',
  },
  planTileDuration: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.55)',
  },
  planTilePrice: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1,
    color: '#ffffff',
  },
  planTileMonthly: {
    fontSize: 10,
    fontWeight: 650,
    color: 'rgba(255,255,255,0.62)',
  },
  planCard: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 14px',
    borderRadius: 16,
    textDecoration: 'none',
    textAlign: 'left' as const,
    width: '100%',
    boxSizing: 'border-box',
  },
  planCardSelected: {
    boxShadow: 'none',
  },
  planCardMain: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    minWidth: 0,
  },
  planCardTitleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  planCardPriceCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  planCardPrice: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1,
    textShadow: '0 0 12px rgba(255,255,255,0.45)',
  },
  planCardMonthly: {
    fontSize: 12,
    fontWeight: 650,
    color: 'rgba(255,255,255,0.62)',
  },
  planCardSavings: {
    marginTop: 2,
    maxWidth: 148,
    fontSize: 11,
    fontWeight: 650,
    lineHeight: 1.3,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.78)',
  },
  planCardBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: 999,
    backgroundColor: '#ff6200',
    color: '#1a0900',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.02em',
    lineHeight: 1.2,
  },
  planCardFooter: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 1.35,
    color: 'rgba(255,255,255,0.68)',
    fontWeight: 500,
  },
  planChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '12px 6px',
    borderRadius: radius.sm,
    border: `1px solid ${colors.borderSubtle}`,
    textDecoration: 'none',
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    textAlign: 'center' as const,
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  planChipSelected: {
    borderColor: '#1e4d3d',
    backgroundColor: '#fffaf3',
    boxShadow: 'none',
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
  planChipBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid rgba(30, 77, 61, 0.28)',
    backgroundColor: 'rgba(30, 77, 61, 0.08)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: '#1e4d3d',
    textDecoration: 'none',
  },
  planChipBadgeBest: {
    border: '1px solid rgba(30, 77, 61, 0.28)',
    backgroundColor: 'rgba(30, 77, 61, 0.08)',
    color: '#1e4d3d',
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
 border: '1px solid rgba(30, 77, 61, 0.28)',
 backgroundColor: 'rgba(30, 77, 61, 0.08)',
 color: '#1c1915',
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
 border: '1px solid rgba(30, 77, 61, 0.28)',
 backgroundColor: 'rgba(30, 77, 61, 0.06)',
 },
 offerBannerTop: {
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'space-between',
 gap: 10,
 marginBottom: 6,
 fontSize: 13,
 color: '#1c1915',
 },
 offerSave: {
 color: '#1e4d3d',
 fontWeight: 700,
 fontSize: 12,
 },
 offerBannerText: {
 margin: '0 0 12px',
 fontSize: 13,
 lineHeight: 1.45,
 color: '#4e4942',
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
 border: '1px solid rgba(30, 77, 61, 0.28)',
 backgroundColor: 'rgba(30, 77, 61, 0.08)',
 color: '#1e4d3d',
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
 border: '1px solid rgba(30, 77, 61, 0.22)',
 background: '#f4efe6',
 },
 priceIncreaseLabel: {
 fontSize: 12,
 fontWeight: 800,
 letterSpacing: '0.12em',
 textTransform: 'uppercase' as const,
 color: '#1e4d3d',
 },
 priceIncreaseValue: {
 fontSize: 18,
 fontWeight: 800,
 fontVariantNumeric: 'tabular-nums' as const,
 letterSpacing: '0.04em',
 color: '#1c1915',
 minWidth: '5.8em',
 textAlign: 'right' as const,
 },
 leagueNote: {
 margin: '0 0 20px',
 color: '#6d675e',
 fontSize: 12,
 lineHeight: 1.45,
 textAlign: 'center' as const,
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
 accentColor: '#1e4d3d',
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
 color: '#1c1915',
 },
 addonPrice: {
 fontSize: 14,
 fontWeight: 800,
 color: '#1e4d3d',
 fontVariantNumeric: 'tabular-nums' as const,
 whiteSpace: 'nowrap' as const,
 },
 addonCopy: {
 fontSize: 12,
 lineHeight: 1.5,
 color: '#6d675e',
 },
 addonTotalNote: {
 margin: `${spacing[2]}px 0 0 30px`,
 fontSize: 12,
 color: '#4e4942',
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
 backgroundColor: '#1e4d3d',
 color: '#f4efe6',
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
 backgroundColor: 'rgba(30, 77, 61, 0.08)',
 border: '1px solid rgba(30, 77, 61, 0.22)',
 borderRadius: radius.sm,
 },
 todoTitle: {
 margin: '0 0 8px',
 fontSize: 12,
 fontWeight: 700,
 color: '#1e4d3d',
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
 color: '#4e4942',
 backgroundColor: '#f4efe6',
 fontFamily: checkoutFont.style.fontFamily,
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
 backgroundColor: '#1e4d3d',
 color: '#f4efe6',
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
 backgroundColor: '#1e4d3d',
 color: '#f4efe6',
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
 color: '#1e4d3d',
 fontWeight: 600,
 },
};
