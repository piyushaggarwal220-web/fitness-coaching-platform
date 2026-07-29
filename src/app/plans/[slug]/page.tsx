import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Syne, DM_Sans } from 'next/font/google'
import { brandTitle } from '@/lib/brand'
import {
  ALL_PLAN_PAGE_PATHS,
  PLAN_INCLUSIONS,
  PLAN_LEAGUE_CALLOUT,
  PLAN_PAGE_COPY,
  RETIRED_PLAN_PAGE_REDIRECTS,
  planPathForSlug,
  resolvePlanFromPath,
  siblingPlans,
  type PlanPagePath,
} from '@/lib/payments/plan-pages'
import type { CoachingPlanSlug } from '@/lib/payments/plans'
import { resolveMarketingBaseUrl } from '@/lib/admin/portal-urls'

const display = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-plan-display',
  display: 'swap',
})

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
  return {
    title: brandTitle(`${plan.name} coaching`),
    description: `${plan.name} LURVOX coaching — ${plan.displayPrice}. Personal workout, diet, weekly check-ins, and coach chat.`,
  }
}

export default async function PlanLandingPage({ params }: PageProps) {
  const { slug } = await params
  const retiredRedirect = RETIRED_PLAN_PAGE_REDIRECTS[slug]
  if (retiredRedirect) {
    redirect(`/plans/${retiredRedirect}`)
  }

  const plan = resolvePlanFromPath(slug)
  if (!plan) notFound()

  const planSlug = plan.slug as CoachingPlanSlug
  const copy = PLAN_PAGE_COPY[planSlug]
  const marketingBase = resolveMarketingBaseUrl()
  const others = siblingPlans(planSlug)

  return (
    <div className={`${display.variable} ${body.variable}`} style={styles.page}>
      <style>{`
        .plan-page-title {
          margin: 10px 0 0;
          font-family: var(--font-plan-body), system-ui, sans-serif;
          font-size: clamp(1.5rem, 5vw, 2.35rem);
          font-weight: 700;
          line-height: 1.25;
          letter-spacing: -0.02em;
          color: #fafafa;
          max-width: 100%;
        }
        @media (max-width: 480px) {
          .plan-page-title {
            font-size: 1.45rem;
            letter-spacing: -0.015em;
          }
        }
      `}</style>
      <div style={styles.atmosphere} aria-hidden />
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <a href={marketingBase} style={styles.backHome}>
            ← Home
          </a>
          <a href={marketingBase} style={styles.brand}>
            LURV<span style={{ color: '#f97316' }}>OX</span>
          </a>
        </div>
        <a href={`${marketingBase}/pages/talk-to-a-coach`} style={styles.headerLink}>
          Talk to a coach
        </a>
      </header>

      <main style={styles.main}>
        <p style={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 className="plan-page-title">{plan.name} plan</h1>
        <p style={styles.promise}>{copy.promise}</p>

        <div style={styles.priceBlock}>
          <p style={styles.price}>{plan.displayPrice}</p>
          <p style={styles.save}>{plan.saveLabel}</p>
          {(plan.popular || plan.best) && (
            <p style={styles.badge}>{plan.best ? 'Best value' : 'Most popular'}</p>
          )}
        </div>

        <p style={styles.bestFor}>
          Best for: <strong style={{ color: '#fafafa', fontWeight: 600 }}>{copy.bestFor}</strong>
        </p>

        <a href={`/checkout?plan=${plan.slug}`} style={styles.cta}>
          Continue to checkout →
        </a>

        <aside style={styles.leagueCallout} aria-label="Consistency League">
          <p style={styles.leagueEyebrow}>{PLAN_LEAGUE_CALLOUT.title}</p>
          <p style={styles.leagueBody}>{PLAN_LEAGUE_CALLOUT.body}</p>
          {plan.slug === '12_months' ? (
            <p style={styles.leagueExtra}>{PLAN_LEAGUE_CALLOUT.twelveMonthExtra}</p>
          ) : (
            <a href="/plans/12-months" style={styles.leagueLink}>
              See the 12-month plan for Crazy League →
            </a>
          )}
        </aside>

        <section style={styles.inclusions}>
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
            {plan.slug === '12_months' && (
              <li style={styles.listItem}>
                <span style={styles.check} aria-hidden>
                  ✓
                </span>
                Crazy League eligibility — prize money up to ₹5,000
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
                {other.name} · {other.displayPrice}
              </Link>
            ))}
          </div>
        </section>

        <p style={styles.footnote}>
          After payment: create your password → assessment → personal plan in 24–48 hours.
        </p>
      </main>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#0a0a0b',
    color: '#fafafa',
    position: 'relative',
    overflowX: 'hidden',
    fontFamily: 'var(--font-plan-body), system-ui, sans-serif',
  },
  atmosphere: {
    position: 'absolute',
    inset: 0,
    background: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(249,115,22,0.28), transparent 55%),
      radial-gradient(ellipse 60% 40% at 90% 20%, rgba(234,88,12,0.12), transparent 50%),
      linear-gradient(180deg, #121214 0%, #0a0a0b 45%, #0c0c0e 100%)
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
    padding: '16px 20px',
    maxWidth: 720,
    margin: '0 auto',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  backHome: {
    fontSize: 13,
    fontWeight: 600,
    color: '#a1a1aa',
    textDecoration: 'none',
  },
  brand: {
    fontFamily: 'var(--font-plan-display), sans-serif',
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: '#fafafa',
    textDecoration: 'none',
  },
  headerLink: {
    fontSize: 13,
    fontWeight: 600,
    color: '#a1a1aa',
    textDecoration: 'none',
    flexShrink: 0,
  },
  main: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 720,
    margin: '0 auto',
    padding: '24px 20px 64px',
    boxSizing: 'border-box',
    width: '100%',
  },
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#f97316',
  },
  promise: {
    margin: '14px 0 0',
    maxWidth: 480,
    fontSize: 16,
    lineHeight: 1.5,
    color: '#c4c4cc',
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
    fontFamily: 'var(--font-plan-body), sans-serif',
    fontSize: 'clamp(1.65rem, 5.5vw, 2.25rem)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  save: {
    margin: 0,
    fontSize: 14,
    color: '#a1a1aa',
  },
  badge: {
    margin: 0,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(249,115,22,0.15)',
    color: '#fb923c',
    fontSize: 12,
    fontWeight: 700,
  },
  bestFor: {
    margin: '16px 0 0',
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 1.45,
  },
  cta: {
    display: 'inline-flex',
    marginTop: 24,
    padding: '14px 22px',
    borderRadius: 14,
    background: '#f97316',
    color: '#09090b',
    fontWeight: 700,
    fontSize: 16,
    textDecoration: 'none',
    boxShadow: '0 8px 28px rgba(249,115,22,0.35)',
  },
  leagueCallout: {
    marginTop: 28,
    padding: '18px 18px 16px',
    borderRadius: 16,
    border: '1px solid rgba(249,115,22,0.28)',
    background: 'rgba(249,115,22,0.08)',
  },
  leagueEyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: '#fb923c',
  },
  leagueBody: {
    margin: '8px 0 0',
    fontSize: 14,
    lineHeight: 1.5,
    color: '#d4d4d8',
  },
  leagueExtra: {
    margin: '10px 0 0',
    fontSize: 14,
    lineHeight: 1.45,
    fontWeight: 600,
    color: '#fafafa',
  },
  leagueLink: {
    display: 'inline-block',
    marginTop: 10,
    fontSize: 14,
    fontWeight: 700,
    color: '#fb923c',
    textDecoration: 'none',
  },
  inclusions: {
    marginTop: 40,
    paddingTop: 28,
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    margin: 0,
    fontFamily: 'var(--font-plan-display), sans-serif',
    fontSize: 'clamp(1.15rem, 4vw, 1.35rem)',
    fontWeight: 700,
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
    color: '#c4c4cc',
  },
  check: {
    color: '#f97316',
    fontWeight: 700,
    flexShrink: 0,
  },
  siblings: {
    marginTop: 36,
  },
  siblingsLabel: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#71717a',
  },
  siblingRow: {
    marginTop: 12,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  siblingChip: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(24,24,27,0.8)',
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  footnote: {
    margin: '36px 0 0',
    fontSize: 13,
    lineHeight: 1.5,
    color: '#71717a',
  },
}
