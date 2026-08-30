import { type CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { DM_Sans } from 'next/font/google'
import { brandTitle } from '@/lib/brand'
import {
  ALL_PLAN_PAGE_PATHS,
  PLAN_INCLUSIONS,
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
    description: `${productName} coaching (${copy.durationLabel}) — from ${plan.displayPrice}. Personal workout, diet, weekly check-ins, and coach chat.`,
  }
}

const AFTER_PAYMENT_STEPS: { title: string; text: string }[] = [
  {
    title: 'Create your login',
    text: 'Right after payment you set a password so you can open the app on your phone or laptop.',
  },
  {
    title: 'Fill a quick assessment',
    text: 'A short form about your body, goals, injuries, food you like, and your daily schedule. Takes a few minutes.',
  },
  {
    title: 'Your coach builds your plan',
    text: 'A real coach reads your answers and makes a workout and diet plan made only for you — not a copy-paste PDF.',
  },
  {
    title: 'Plan lands in 24 to 48 hours',
    text: 'You get your personal workout and diet inside the app, ready to start. No waiting around for weeks.',
  },
  {
    title: 'Start training and log daily',
    text: 'Follow the plan, tick off workouts and meals, and message your coach in the app whenever you are stuck.',
  },
  {
    title: 'Check-ins keep it moving',
    text: 'You share photos and progress, and your coach adjusts the plan so results keep coming instead of stalling.',
  },
]

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
          LURV<span style={{ color: '#ff6200' }}>OX</span>
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
        <p style={styles.eyebrow}>{productName}</p>
        <h1 className="plan-page-title">
          {productName}
          <span style={{ display: 'block', marginTop: 6, fontSize: '0.55em', fontWeight: 650, color: 'rgba(255,255,255,0.55)' }}>
            {copy.durationLabel}
          </span>
        </h1>
        <p style={styles.promise}>{copy.promise}</p>

        <div style={styles.priceBlock}>
          <p style={styles.price}>{saleDisplay}</p>
          {(plan.popular || plan.best) && (
            <p style={styles.badge}>{plan.best ? 'Best value' : 'Most popular'}</p>
          )}
          {planSlug === '12_months' ? (
            <p style={styles.codeHint}>Includes weekly coach phone call · 12-month exclusive</p>
          ) : null}
        </div>

        <p style={styles.bestFor}>
          Best for: <strong style={{ color: '#fff', fontWeight: 600 }}>{copy.bestFor}</strong>
        </p>

        <ul style={styles.goalList}>
          {copy.goals.map((goal) => (
            <li key={goal} style={styles.goalItem}>
              <span style={styles.check} aria-hidden>
                ✓
              </span>
              {goal}
            </li>
          ))}
        </ul>

        <a href={`/checkout?plan=${plan.slug}`} style={styles.cta}>
          Continue to checkout
        </a>

        <section style={styles.afterPay}>
          <p style={styles.siblingsLabel}>After you pay</p>
          <h2 style={styles.sectionTitle}>What happens once you pay</h2>
          <ol style={styles.steps}>
            {AFTER_PAYMENT_STEPS.map((step, index) => (
              <li key={step.title} style={styles.step}>
                <span style={styles.stepNum} aria-hidden>
                  {index + 1}
                </span>
                <span style={styles.stepBody}>
                  <span style={styles.stepTitle}>{step.title}</span>
                  <span style={styles.stepText}>{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section style={styles.included}>
          <h2 style={styles.sectionTitle}>Everything included</h2>
          <ul style={styles.list}>
            {PLAN_INCLUSIONS.map((item) => (
              <li key={item} style={styles.listItem}>
                <span style={styles.check} aria-hidden>
                  ✓
                </span>
                {item}
              </li>
            ))}
            <li style={styles.listItem}>
              <span style={styles.check} aria-hidden>
                ✓
              </span>
              {planSlug === '3_months' ? 'Plan updates every 14 days' : 'Plan updates every week'}
            </li>
            {plan.slug === '12_months' && (
              <li style={styles.listItem}>
                <span style={styles.check} aria-hidden>
                  ✓
                </span>
                Weekly coach phone call included
              </li>
            )}
          </ul>
        </section>

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
                  · {planDurationLabel(other.slug)} · {saleLabel(other.slug) ?? other.displayPrice}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <p style={styles.footnote}>
          After payment: create your password → assessment → personal plan in 24–48 hours.
          You can upgrade to a better plan within 48 hours of taking your plan. After 48 hours, upgrades cost ₹250 extra.
        </p>
      </main>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#050505',
    color: '#ffffff',
    position: 'relative',
    overflowX: 'hidden',
    fontFamily: 'var(--font-plan-body), system-ui, sans-serif',
  },
  atmosphere: {
    position: 'absolute',
    inset: 0,
    background: `
      radial-gradient(ellipse 70% 120% at 50% -40%, rgba(255, 98, 0, 0.28), transparent 60%),
      linear-gradient(180deg, #050505 0%, #070707 100%)
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
    borderBottom: '1px solid rgba(255, 98, 0, 0.22)',
    background: '#050505',
  },
  brand: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: '#ffffff',
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
    color: '#ff8a3d',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  headerCall: {
    fontSize: 13,
    fontWeight: 700,
    color: '#ff6200',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  main: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 860,
    margin: '0 auto',
    padding: '28px 20px 72px',
    boxSizing: 'border-box',
    width: '100%',
  },
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#ff6200',
  },
  promise: {
    margin: '14px 0 0',
    maxWidth: 520,
    fontSize: 16,
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.72)',
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
    color: '#ffffff',
    textShadow: '0 0 18px rgba(255,255,255,0.28)',
  },
  save: {
    margin: 0,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  codeHint: {
    margin: 0,
    flexBasis: '100%',
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.4,
  },
  badge: {
    margin: 0,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(255, 98, 0, 0.16)',
    color: '#ff8a3d',
    fontSize: 12,
    fontWeight: 700,
  },
  bestFor: {
    margin: '18px 0 0',
    fontSize: 15,
    color: 'rgba(255,255,255,0.62)',
    lineHeight: 1.5,
  },
  goalList: {
    margin: '14px 0 0',
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gap: 8,
  },
  goalItem: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    fontSize: 15,
    lineHeight: 1.4,
    color: '#f7f4ee',
  },
  cta: {
    display: 'inline-flex',
    marginTop: 24,
    padding: '14px 22px',
    borderRadius: 999,
    background: '#ff6200',
    color: '#050505',
    fontWeight: 800,
    fontSize: 15,
    textDecoration: 'none',
    boxShadow: '0 8px 28px rgba(255, 98, 0, 0.35)',
  },
  afterPay: {
    marginTop: 40,
    paddingTop: 28,
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  steps: {
    margin: '18px 0 0',
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gap: 14,
  },
  step: {
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
  },
  stepNum: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 999,
    background: 'rgba(255, 98, 0, 0.16)',
    color: '#ff8a3d',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
  },
  stepBody: {
    display: 'grid',
    gap: 3,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#ffffff',
  },
  stepText: {
    fontSize: 14,
    lineHeight: 1.45,
    color: 'rgba(255,255,255,0.66)',
  },
  included: {
    marginTop: 40,
    paddingTop: 28,
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    margin: '6px 0 0',
    fontSize: 'clamp(1.15rem, 4vw, 1.4rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  list: {
    margin: '16px 0 0',
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gap: 12,
  },
  listItem: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    fontSize: 15,
    lineHeight: 1.45,
    color: 'rgba(255,255,255,0.72)',
  },
  check: {
    color: '#ff6200',
    fontWeight: 700,
    flexShrink: 0,
  },
  siblings: {
    marginTop: 36,
  },
  siblingsLabel: {
    margin: '28px 0 0',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#ff6200',
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
    border: '1px solid rgba(255, 98, 0, 0.35)',
    background: 'rgba(255, 98, 0, 0.08)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  footnote: {
    margin: '36px 0 0',
    fontSize: 13,
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.4)',
  },
}
