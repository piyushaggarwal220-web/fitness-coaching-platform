import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { brandTitle } from '@/lib/brand'
import {
  ALL_PLAN_PAGE_PATHS,
  PLAN_PAGE_COPY,
  PLAN_PRODUCT_NAME,
  RETIRED_PLAN_PAGE_REDIRECTS,
  resolvePlanFromPath,
  type LongCoachingPlanSlug,
} from '@/lib/payments/plan-pages'
import styles from './bridge.module.css'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const PLAN_NOTES: Record<LongCoachingPlanSlug, { length: string; monthly: string; points: string[] }> = {
  '3_months': {
    length: '90 days',
    monthly: '₹666/month',
    points: [
      'Best if you want to drop fat and look leaner.',
      'Your coach updates the plan every 14 days.',
    ],
  },
  '6_months': {
    length: '6 months',
    monthly: '₹583/month',
    points: [
      'Best if you want to lose fat and build muscle.',
      'Your coach updates the plan every week.',
      'Includes cardio, supplements, and help if you stall.',
    ],
  },
  '12_months': {
    length: '12 months',
    monthly: '₹500/month',
    points: [
      'Best if you want an athletic body: less fat, more muscle, and better stamina.',
      'Your coach updates the plan every week and calls you once a week.',
      'Men get a testosterone protocol. Women get hourglass guidance.',
    ],
  },
}

const SHARED = [
  'A workout plan for the gym, home, or both.',
  'A diet plan built around the food you eat.',
  'A real coach you can message in the app.',
  'Check-ins in the middle of the week and once a week.',
  'Daily trackers, progress photos, and a record of the journey.',
]

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
    description: `${productName} coaching (${copy.durationLabel}) — ${plan.displayPrice}. Personal workout, diet, check-ins, and a coach in the app.`,
  }
}

export const viewport: Viewport = {
  themeColor: '#100b08',
}

function checkoutHref(
  planSlug: string,
  query: Record<string, string | string[] | undefined>,
): string {
  const next = new URLSearchParams()
  next.set('plan', planSlug)
  for (const [key, value] of Object.entries(query)) {
    if (key === 'plan' || value == null) continue
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item)
    } else {
      next.set(key, value)
    }
  }
  return `/checkout?${next.toString()}`
}

export default async function PlanLandingPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const retiredRedirect = RETIRED_PLAN_PAGE_REDIRECTS[slug]
  if (retiredRedirect) {
    redirect(`/plans/${retiredRedirect}`)
  }

  const plan = resolvePlanFromPath(slug)
  if (!plan) notFound()

  const planSlug = plan.slug as LongCoachingPlanSlug
  const copy = PLAN_PAGE_COPY[planSlug]
  const notes = PLAN_NOTES[planSlug]
  const query = await searchParams
  const payHref = checkoutHref(plan.slug, query)

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.checkoutBar}>
          <p className={styles.brand}>LURVOX</p>
          <Link className={styles.checkout} href={payHref}>
            <strong>Continue to checkout</strong>
            <span>
              {plan.displayPrice} · {copy.goalName}
            </span>
          </Link>
        </div>

        <section className={styles.frame} aria-label={copy.goalName}>
          <div className={styles.card}>
            <p className={styles.eyebrow}>{notes.length}</p>
            <h1 className={styles.title}>{copy.goalName}</h1>
            <p className={styles.lede}>{copy.promise}</p>
            <p className={styles.price}>
              <strong>{plan.displayPrice}</strong>
              <span>{notes.monthly}</span>
            </p>

            <div className={styles.block}>
              <h2>This plan</h2>
              <ul>
                {notes.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>

            <div className={styles.block}>
              <h2>Included</h2>
              <ul>
                {SHARED.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>

            <div className={styles.block}>
              <h2>After you pay</h2>
              <ol className={styles.steps}>
                <li>Create your account.</li>
                <li>Fill a short form and add your photos.</li>
                <li>Your first workout and diet arrive within 24–48 hours.</li>
              </ol>
            </div>
          </div>
        </section>

        <section className={styles.call} aria-label="Talk to a coach">
          <p>Not sure this is the right plan?</p>
          <Link href="/talk-to-a-coach">
            <strong>Book a free call</strong>
            <span>Name and WhatsApp. A coach calls you. No payment.</span>
          </Link>
        </section>
      </div>
    </main>
  )
}
