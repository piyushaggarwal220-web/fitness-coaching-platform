import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Syne, DM_Sans } from 'next/font/google'
import { brandTitle } from '@/lib/brand'
import {
  ALL_PLAN_PAGE_PATHS,
  PLAN_INCLUSIONS,
  PLAN_PAGE_COPY,
  planPathForSlug,
  resolvePlanFromPath,
  siblingPlans,
  type PlanPagePath,
} from '@/lib/payments/plan-pages'
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
  const plan = resolvePlanFromPath(slug)
  if (!plan) notFound()

  const copy = PLAN_PAGE_COPY[plan.slug]
  const marketingBase = resolveMarketingBaseUrl()
  const others = siblingPlans(plan.slug)

  return (
    <div className={`${display.variable} ${body.variable}`} style={styles.page}>
      <div style={styles.atmosphere} aria-hidden />
      <header style={styles.header}>
        <a href={marketingBase} style={styles.brand}>
          LURV<span style={{ color: '#f97316' }}>OX</span>
        </a>
        <a href={`${marketingBase}/pages/talk-to-a-coach`} style={styles.headerLink}>
          Talk to a coach
        </a>
      </header>

      <main style={styles.main}>
        <p style={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 style={styles.title}>
          {plan.name}
          <span style={styles.titleAccent}> coaching</span>
        </h1>
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
          </ul>
        </section>

        <section style={styles.siblings}>
          <p style={styles.siblingsLabel}>Other plans</p>
          <div style={styles.siblingRow}>
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/plans/${planPathForSlug(other.slug) as PlanPagePath}`}
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
    overflow: 'hidden',
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
    padding: '20px 24px',
    maxWidth: 720,
    margin: '0 auto',
  },
  brand: {
    fontFamily: 'var(--font-plan-display), sans-serif',
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '0.06em',
    color: '#fafafa',
    textDecoration: 'none',
  },
  headerLink: {
    fontSize: 13,
    fontWeight: 600,
    color: '#a1a1aa',
    textDecoration: 'none',
  },
  main: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 720,
    margin: '0 auto',
    padding: '32px 24px 64px',
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: '#f97316',
  },
  title: {
    margin: '12px 0 0',
    fontFamily: 'var(--font-plan-display), sans-serif',
    fontSize: 'clamp(2.4rem, 8vw, 3.6rem)',
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: '-0.03em',
  },
  titleAccent: {
    color: '#c4c4cc',
    fontWeight: 600,
  },
  promise: {
    margin: '16px 0 0',
    maxWidth: 480,
    fontSize: 17,
    lineHeight: 1.5,
    color: '#c4c4cc',
  },
  priceBlock: {
    marginTop: 28,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: '8px 16px',
  },
  price: {
    margin: 0,
    fontFamily: 'var(--font-plan-display), sans-serif',
    fontSize: 40,
    fontWeight: 800,
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
    marginTop: 28,
    padding: '16px 28px',
    borderRadius: 14,
    background: '#f97316',
    color: '#09090b',
    fontWeight: 700,
    fontSize: 16,
    textDecoration: 'none',
    boxShadow: '0 8px 28px rgba(249,115,22,0.35)',
  },
  inclusions: {
    marginTop: 48,
    paddingTop: 32,
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    margin: 0,
    fontFamily: 'var(--font-plan-display), sans-serif',
    fontSize: 22,
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
    marginTop: 40,
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
