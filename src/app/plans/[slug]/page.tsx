import { type CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { DM_Sans } from 'next/font/google'
import { brandTitle } from '@/lib/brand'
import {
 ALL_PLAN_PAGE_PATHS,
 PLAN_PAGE_COPY,
 PLAN_PRODUCT_NAME,
 RETIRED_PLAN_PAGE_REDIRECTS,
 planDurationLabel,
 planGoalName,
 planPathForSlug,
 resolvePlanFromPath,
 siblingPlans,
 type LongCoachingPlanSlug,
} from '@/lib/payments/plan-pages'
import type { CoachingPlanSlug } from '@/lib/payments/plans'
import { resolveMarketingBaseUrl } from '@/lib/admin/portal-urls'

const body = DM_Sans({
 subsets: ['latin'],
 weight: ['400', '500', '600', '700'],
 variable: '--font-plan-body',
 display: 'swap',
})

type PageProps = {
 params: Promise<{ slug: string }>
}

export function generateStaticParams() {
 return ALL_PLAN_PAGE_PATHS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
 const { slug } = await params
 const plan = resolvePlanFromPath(slug)
 if (!plan) return { title: brandTitle('Plan') }
 const planSlug = plan.slug as LongCoachingPlanSlug
 const copy = PLAN_PAGE_COPY[planSlug]
 const productName = PLAN_PRODUCT_NAME[planSlug]
 return {
 title: brandTitle(`${productName} · ${copy.durationLabel}`),
 description: `${productName} coaching (${copy.durationLabel}) - from ${plan.displayPrice}. Personal workout, diet, check-ins, tracker, journey, and coach chat included.`,
 }
}

const AFTER_PAY =
 'Answer a few basics → verify email → unlock your plan → personal plan on the platform in 24-48 hours.'

export default async function PlanLandingPage({ params }: PageProps) {
 const { slug } = await params
 const retiredRedirect = RETIRED_PLAN_PAGE_REDIRECTS[slug]
 if (retiredRedirect) {
 redirect(`/plans/${retiredRedirect}`)
 }

 const plan = resolvePlanFromPath(slug)
 if (!plan) notFound()

 const planSlug = plan.slug as LongCoachingPlanSlug
 const copy = PLAN_PAGE_COPY[planSlug]
 const productName = PLAN_PRODUCT_NAME[planSlug]
 const marketingBase = resolveMarketingBaseUrl()
 const others = siblingPlans(planSlug)
 const saleDisplay = plan.displayPrice

 return (
 <div className={body.variable} style={styles.page}>
 <style>{`
 .plan-page-title {
 margin: 10px 0 0;
 font-family: var(--font-plan-body), system-ui, sans-serif;
 font-size: clamp(1.55rem, 5vw, 2.4rem);
 font-weight: 800;
 line-height: 1.2;
 letter-spacing: -0.03em;
 color: #ffffff;
 max-width: 100%;
 }
 @media (max-width: 480px) {
 .plan-page-title { font-size: 1.45rem; }
 }
 `}</style>
 <div style={styles.atmosphere} aria-hidden />

 <header style={styles.header}>
 <a href={marketingBase} style={styles.brand}>
 LURV<span style={{ color: '#fbbf24' }}>OX</span>
 </a>
 <div style={styles.headerRight}>
 <a href="/login" style={styles.headerLink}>
 Log in
 </a>
 <a href={`${marketingBase}/pages/talk-to-a-coach`} style={styles.headerCall}>
 Talk to a coach
 </a>
 </div>
 </header>

 <main style={styles.main}>
 <a href={marketingBase} style={styles.planTap} aria-label="Open LURVOX home">
 <p style={styles.eyebrow}>{copy.durationLabel}</p>
 <h1 className="plan-page-title">{productName}</h1>
 <p style={styles.promise}>{copy.promise}</p>
 <div style={styles.priceBlock}>
 <p style={styles.price}>{saleDisplay}</p>
 </div>
 <p style={styles.shopifyHint}>Tap to open lurvox.in</p>
 </a>

 <a href={`/checkout?plan=${plan.slug}`} style={styles.cta}>
 Start my intake
 </a>
 <p style={styles.afterPayLine}>{AFTER_PAY}</p>

 <section style={styles.siblings}>
 <p style={styles.siblingsLabel}>Other plans</p>
 <div style={styles.siblingRow}>
 {others.map((other) => (
 <Link
 key={other.slug}
 href={`/plans/${planPathForSlug(other.slug as CoachingPlanSlug)}`}
 style={styles.siblingChip}
 >
 {planGoalName(other.slug)}
 <span style={{ opacity: 0.65, fontWeight: 500 }}>
 {' '}
 · {planDurationLabel(other.slug)} · {other.displayPrice}
 </span>
 </Link>
 ))}
 </div>
 </section>
 </main>
 </div>
 )
}

const styles: Record<string, CSSProperties> = {
 page: {
 minHeight: '100dvh',
 background: '#12100f',
 color: '#f8fafc',
 position: 'relative',
 overflowX: 'hidden',
 fontFamily: 'var(--font-plan-body), system-ui, sans-serif',
 },
 atmosphere: {
 position: 'absolute',
 inset: 0,
 background: `
 radial-gradient(ellipse 70% 45% at 85% 0%, rgba(225, 29, 72, 0.22), transparent 55%),
 radial-gradient(ellipse 55% 40% at 0% 15%, rgba(34, 197, 94, 0.16), transparent 50%),
 radial-gradient(ellipse 50% 35% at 50% 100%, rgba(251, 191, 36, 0.12), transparent 55%)
 `,
 pointerEvents: 'none',
 },
 header: {
 position: 'relative',
 zIndex: 1,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'space-between',
 gap: 12,
 padding: '14px 20px',
 borderBottom: '1px solid rgba(251, 191, 36, 0.22)',
 background: '#12100f',
 },
 brand: {
 fontSize: 20,
 fontWeight: 800,
 letterSpacing: '0.04em',
 color: '#fbbf24',
 textDecoration: 'none',
 },
 headerRight: {
 display: 'flex',
 alignItems: 'center',
 gap: 16,
 flexShrink: 0,
 flexWrap: 'nowrap',
 },
 headerLink: {
 fontSize: 13,
 fontWeight: 700,
 color: '#fbbf24',
 textDecoration: 'none',
 whiteSpace: 'nowrap',
 },
 headerCall: {
 fontSize: 13,
 fontWeight: 700,
 color: '#22c55e',
 textDecoration: 'none',
 whiteSpace: 'nowrap',
 },
 main: {
 position: 'relative',
 zIndex: 1,
 padding: '40px 20px 48px',
 maxWidth: 520,
 margin: '0 auto',
 },
 planTap: {
 display: 'block',
 textDecoration: 'none',
 color: 'inherit',
 marginBottom: 20,
 },
 shopifyHint: {
 margin: '10px 0 0',
 fontSize: 12,
 color: '#cbd5e1',
 opacity: 0.8,
 },
 eyebrow: {
 margin: 0,
 fontSize: 11,
 fontWeight: 800,
 letterSpacing: '0.14em',
 textTransform: 'uppercase',
 color: '#fbbf24',
 },
 promise: {
 margin: '14px 0 0',
 maxWidth: 520,
 fontSize: 16,
 lineHeight: 1.5,
 color: '#cbd5e1',
 },
 priceBlock: {
 marginTop: 24,
 display: 'flex',
 flexWrap: 'wrap',
 alignItems: 'baseline',
 gap: '8px 14px',
 },
 price: {
 margin: 0,
 fontSize: 'clamp(1.7rem, 5.5vw, 2.35rem)',
 fontWeight: 800,
 letterSpacing: '-0.03em',
 color: '#fbbf24',
 },
 cta: {
 display: 'inline-flex',
 marginTop: 24,
 padding: '14px 22px',
 borderRadius: 999,
 background: '#16a34a',
 color: '#ffffff',
 fontWeight: 800,
 fontSize: 15,
 textDecoration: 'none',
 boxShadow: '0 8px 28px rgba(22, 163, 74, 0.35)',
 },
 afterPayLine: {
 margin: '14px 0 0',
 maxWidth: 420,
 fontSize: 13,
 lineHeight: 1.45,
 color: '#cbd5e1',
 },
 siblings: {
 marginTop: 40,
 paddingTop: 28,
 borderTop: '1px solid rgba(251, 191, 36, 0.22)',
 },
 siblingsLabel: {
 margin: 0,
 fontSize: 11,
 fontWeight: 800,
 letterSpacing: '0.14em',
 textTransform: 'uppercase',
 color: '#fbbf24',
 },
 siblingRow: {
 marginTop: 12,
 display: 'flex',
 flexWrap: 'wrap',
 gap: 8,
 },
 siblingChip: {
 padding: '10px 14px',
 borderRadius: 999,
 border: '1px solid rgba(251, 191, 36, 0.35)',
 background: 'rgba(251, 191, 36, 0.08)',
 color: '#f8fafc',
 fontSize: 13,
 fontWeight: 600,
 textDecoration: 'none',
 },
}
