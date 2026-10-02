import type { Metadata } from 'next'
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

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
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

export default async function PlanLandingPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const retiredRedirect = RETIRED_PLAN_PAGE_REDIRECTS[slug]
  if (retiredRedirect) {
    redirect(`/plans/${retiredRedirect}`)
  }

  const plan = resolvePlanFromPath(slug)
  if (!plan) notFound()

  const query = await searchParams
  const next = new URLSearchParams()
  next.set('plan', plan.slug)
  for (const [key, value] of Object.entries(query)) {
    if (key === 'plan' || value == null) continue
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item)
    } else {
      next.set(key, value)
    }
  }

  redirect(`/checkout?${next.toString()}`)
}
