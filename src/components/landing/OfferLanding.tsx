'use client'

import { useEffect, useRef, useState } from 'react'
import { INSTANT_PLAN_WINDOW_LABEL } from '@/lib/plan-delivery-window'
import {
  DURATION_OFFER_EXTRA,
  DURATION_OFFER_RECEIVE,
  durationOfferCardPoints,
  durationOfferCardPriceNote,
  durationOfferCardTag,
  durationOfferCardTitle,
} from '@/lib/payments/duration-offer-points'
import { getCoachingPlan, type CoachingPlanSlug } from '@/lib/payments/plans'
import { FIRST_PLAN_TARGET } from '@/lib/payments/plan-pages'
import { PreviewAdCapture } from '@/components/studio/PreviewAdCapture'
import {
  PREVIEW2_AD_PATH,
  PREVIEW2_DROPOFF_SECTIONS,
  PREVIEW5_AD_PATH,
  PREVIEW5_DROPOFF_SECTIONS,
} from '@/lib/analytics/ad-landing'
import { DirectCheckout } from './DirectCheckout'
import { PrimaryCta } from './primitives'
import { PreviewSaleProvider, usePreviewSale } from './PreviewSaleCode'
import { SaleEndsTimer } from './SaleEndsTimer'

export type CoachResult = {
  key: 'piyush'
  name: string
  handle: string
  href: string
  portrait: string
  before: string | null
  after: string | null
}

type Goal = {
  slug: string
  label: string
  title: string
  length: string
  days: number
  monthly: string
  update: string
  finish: string
  image: string
  focus: string
}

const GOALS: Goal[] = [
  {
    slug: '3_months',
    label: 'Fat loss',
    title: 'The 90 days you keep putting off.',
    length: '90 days',
    days: 90,
    monthly: '₹666 a month',
    update: 'Every 14 days',
    finish: 'Day 90',
    image: '/images/lurvox/offer/hero-fat-loss.webp',
    focus: 'center 22%',
  },
  {
    slug: '6_months',
    label: 'Muscle',
    title: 'Six months to lose fat and build muscle.',
    length: '6 months',
    days: 180,
    monthly: '₹583 a month',
    update: 'Every week',
    finish: 'Month 6',
    image: '/images/lurvox/offer/hero-muscle.webp?v=2',
    focus: 'center 22%',
  },
  {
    slug: '12_months',
    label: 'Athletic',
    title: 'A year of training like an athlete.',
    length: '12 months',
    days: 365,
    monthly: '₹500 a month',
    update: 'Every week',
    finish: 'Month 12',
    image: '/images/lurvox/offer/hero-athletic.webp?v=3',
    focus: 'center 22%',
  },
]

const DURATION_GOALS: Goal[] = [
  {
    slug: 'offer_1_month',
    label: 'Starter',
    title: 'The starter. One month.',
    length: '1 month',
    days: 30,
    monthly: '₹249 a month',
    update: 'Included',
    finish: 'Day 30',
    image: '/images/lurvox/offer/hero-fat-loss.webp',
    focus: 'center 22%',
  },
  {
    slug: 'offer_3_months',
    label: 'Finisher',
    title: 'The finisher. Three months.',
    length: '3 months',
    days: 90,
    monthly: '₹166 a month',
    update: 'Included',
    finish: 'Day 90',
    image: '/images/lurvox/offer/hero-muscle.webp?v=2',
    focus: 'center 22%',
  },
]

const DAILY = [
  {
    title: 'Diet',
    body: 'Meals around your food and your schedule.',
    image: '/images/lurvox/campaign/nutrition-meal.webp',
    alt: 'Woman plating a meal in a home kitchen',
  },
  {
    title: 'Workout',
    body: 'Sessions for your goal, level, and equipment. Gym, home, or both.',
    image: '/images/lurvox/campaign/training-session.webp',
    alt: 'Man performing a seated cable row',
  },
  {
    title: 'Sleep guidance',
    body: 'When to sleep, and what to change when you are not recovering.',
    image: '/images/lurvox/campaign/sleep-guidance.webp',
    alt: 'Man asleep in bed',
  },
  {
    title: 'Cardio',
    body: 'Written around your training. On the 6 and 12 month plans.',
    image: '/images/lurvox/campaign/cardio-session.webp',
    alt: 'Woman running on a treadmill',
  },
  {
    title: 'Supplement guidance',
    body: 'What to take and what to skip. On the 6 and 12 month plans.',
    image: '/images/lurvox/campaign/supplement-guidance.webp',
    alt: 'Man holding a shaker after training',
  },
]

const PLAN_POINTS: Record<CoachingPlanSlug, { text: string; note?: string; gold?: boolean }[]> = {
  '3_months': [
    { text: 'Workout for your level, at a gym or at home' },
    { text: 'Diet built around the food you already eat' },
    { text: 'Check-in mid-week and every week' },
    { text: 'Coach chat in the app when you are stuck' },
    { text: 'Plan rewritten every 14 days' },
  ],
  '6_months': [
    { text: 'Workout and diet, rewritten every week' },
    { text: 'A cardio plan on top of the training' },
    { text: 'A supplement plan' },
    { text: 'Extra help if progress stalls after 90 days' },
    { text: 'Check-ins and coach chat the whole way' },
  ],
  '12_months': [
    { text: 'Everything included in fat loss + muscle gain' },
    { text: 'Stamina work' },
    { text: 'Updated every week' },
  ],
}

const START_STEPS = [
  { when: 'Payment', title: 'Payment is confirmed.' },
  { when: 'Questions', title: 'Complete the onboarding form.' },
  { when: 'Photos', title: 'Send front, side, and back photos. Required unless the form marks them optional.' },
  { when: INSTANT_PLAN_WINDOW_LABEL, title: `The first plan arrives within ${INSTANT_PLAN_WINDOW_LABEL} after that.` },
  { when: 'Your plan', title: 'You get a diet and a workout. Cardio and supplements are on the 6- and 12-month plans.' },
  { when: 'Every day', title: 'Start the daily trackers. A few form clips are free in the app. The full library is a separate purchase.' },
]

const FAQ = [
  {
    q: 'Can I train at home?',
    a: 'Yes. The workout is written for home, a gym, or both, using the equipment you actually have. A gym membership is not required.',
  },
  {
    q: 'Will the diet work with food I have at home?',
    a: 'Yes. Meals are built around the food you already eat and the schedule you already keep. You do not need a separate grocery list of foods you have never cooked.',
  },
  {
    q: 'What does coaching cost?',
    a: 'Fat loss is ₹1,999 for 90 days, about ₹22 a day. Fat loss and muscle gain is ₹3,499 for 6 months, about ₹19 a day. The athletic plan is ₹5,999 for the year, about ₹16 a day.',
  },
  {
    q: 'Is the plan personalised?',
    a: 'Yes. After payment you answer the questions and send photos. Your coach writes the plan for your body, your goal, and your day. It is not a copied template.',
  },
  {
    q: 'Why are the rates this low?',
    a: 'This is online coaching in the app: a plan written for you, check-ins, and coach chat. It is not a trainer standing with you in person every session. That is why it starts at ₹1,999.',
  },
  {
    q: 'What happens after I pay?',
    a: `${FIRST_PLAN_TARGET} You then get your diet and workout. Cardio and supplement guidance are on the 6-month and 12-month plans. Daily trackers start after that. A few form clips are free in the app. The full library is a separate purchase.`,
  },
  {
    q: 'What is the refund policy?',
    a: 'Sales are final once payment is captured, except where the Terms say otherwise.',
  },
]

function perDay(goal: Goal) {
  const amount = getCoachingPlan(goal.slug)?.amountPaise ?? 0
  return `under ₹${Math.ceil(amount / 100 / goal.days)} a day`
}

function pointsFor(slug: string) {
  return PLAN_POINTS[slug as CoachingPlanSlug]
}

function BeforeAfter({ coach }: { coach: CoachResult }) {
  const afterSrc = coach.after ?? coach.portrait
  const afterLabel = coach.after ? 'After' : 'Now'
  if (!coach.before) {
    return (
      <div className="lxo-ba lxo-ba-pending">
        <figure>
          <div className="lxo-ba-empty">
            <span>Before photo</span>
          </div>
          <figcaption>Before</figcaption>
        </figure>
        <figure>
          <img src={coach.portrait} alt={coach.name} loading="lazy" />
          <figcaption>Now</figcaption>
        </figure>
      </div>
    )
  }
  return (
    <div className="lxo-ba">
      <figure>
        <img src={coach.before} alt={`${coach.name} before`} loading="lazy" />
        <figcaption>Before</figcaption>
      </figure>
      <figure>
        <img src={afterSrc} alt={coach.after ? `${coach.name} after` : coach.name} loading="lazy" />
        <figcaption>{afterLabel}</figcaption>
      </figure>
    </div>
  )
}

export function OfferLanding(props: {
  coaches: CoachResult[]
  adPath?: typeof PREVIEW2_AD_PATH | typeof PREVIEW5_AD_PATH
  durationOffer?: boolean
}) {
  return (
    <PreviewSaleProvider>
      <OfferLandingView {...props} />
    </PreviewSaleProvider>
  )
}

function OfferLandingView({
  coaches,
  adPath,
  durationOffer = false,
}: {
  coaches: CoachResult[]
  adPath?: typeof PREVIEW2_AD_PATH | typeof PREVIEW5_AD_PATH
  durationOffer?: boolean
}) {
  const sale = usePreviewSale()
  const goals = durationOffer ? DURATION_GOALS : GOALS
  const goalsRef = useRef(goals)
  goalsRef.current = goals
  const [slug, setSlug] = useState(durationOffer ? 'offer_3_months' : '3_months')
  const [payPlan, setPayPlan] = useState<string | null>(null)
  const rotateTimer = useRef<number | null>(null)
  const heroInView = useRef(true)

  const stopRotation = () => {
    if (rotateTimer.current === null) return
    window.clearInterval(rotateTimer.current)
    rotateTimer.current = null
  }

  const pickPlan = (next: string) => {
    stopRotation()
    setSlug(next)
  }
  const goal = goals.find((item) => item.slug === slug) ?? goals[0]
  const payFor = (planSlug: string) => {
    if (!durationOffer) return getCoachingPlan(planSlug)?.displayPrice ?? ''
    return sale.quote(planSlug)?.payLabel ?? ''
  }
  const startLabel = `Start for ${payFor(goal.slug)}`
  const rootRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLOListElement>(null)
  const [stickyOn, setStickyOn] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const goals = rootRef.current?.querySelector('.lxo-goals')
    const watch = new IntersectionObserver(([entry]) => {
      heroInView.current = entry.isIntersecting
    }, { threshold: 0.35 })
    if (goals) watch.observe(goals)
    rotateTimer.current = window.setInterval(() => {
      if (!heroInView.current || document.hidden) return
      setSlug((current) => {
        const list = goalsRef.current
        const index = list.findIndex((item) => item.slug === current)
        return list[(index + 1) % list.length].slug
      })
    }, 1500)
    return () => {
      watch.disconnect()
      if (rotateTimer.current !== null) {
        window.clearInterval(rotateTimer.current)
        rotateTimer.current = null
      }
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) root.classList.add('lxo-anim')
    const items = root.querySelectorAll('.lxo-rise')
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-in', '')
          reveal.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' }
    )
    items.forEach((item) => reveal.observe(item))

    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        const ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0
        progressRef.current?.style.setProperty('--lxo-progress', String(ratio))
        root.querySelectorAll('.lxo-rise:not([data-in])').forEach((item) => {
          if (item.getBoundingClientRect().top < window.innerHeight) item.setAttribute('data-in', '')
        })
        const rail = railRef.current
        if (rail) {
          const box = rail.getBoundingClientRect()
          const start = window.innerHeight * 0.7
          const filled = Math.max(0, Math.min(1, (start - box.top) / Math.max(1, box.height)))
          rail.style.setProperty('--lxo-rail', String(filled))
          rail.querySelectorAll('li').forEach((li) => {
            const top = li.getBoundingClientRect().top
            li.classList.toggle('is-reached', top < start)
          })
        }
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    const heroCta = root.querySelector('.lxo-hero .lxo-cta')
    const pricing = root.querySelector('#pricing')
    let heroGone = false
    let pricingOn = false
    const syncSticky = () => setStickyOn(heroGone && !pricingOn)
    const sticky = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === heroCta) heroGone = !entry.isIntersecting
          if (entry.target === pricing) pricingOn = entry.isIntersecting && entry.intersectionRatio >= 0.2
        }
        syncSticky()
      },
      { threshold: [0, 0.2] }
    )
    if (heroCta) sticky.observe(heroCta)
    if (pricing) sticky.observe(pricing)

    return () => {
      reveal.disconnect()
      sticky.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const openPay = durationOffer ? setPayPlan : undefined
  const ctaSource = adPath === PREVIEW5_AD_PATH ? 'preview5' : adPath === PREVIEW2_AD_PATH ? 'preview2' : 'landing'
  const ctaLanding = adPath === PREVIEW5_AD_PATH || adPath === PREVIEW2_AD_PATH ? adPath : undefined
  const daily = durationOffer
    ? DAILY.map((item) => {
        if (item.title === 'Diet') {
          return { ...item, title: 'Diet chart and diet plan', body: 'A diet chart and a diet plan around your food and your schedule.' }
        }
        if (item.title === 'Workout') return { ...item, title: 'Workout plan', body: 'Sessions for your level and equipment. Gym, home, or both.' }
        if (item.title === 'Cardio') return { ...item, body: 'Written around your training. Included on both lengths.' }
        if (item.title === 'Supplement guidance') {
          return { ...item, body: 'What to take and what to skip. Included on both lengths.' }
        }
        return item
      })
    : DAILY
  const steps = durationOffer
    ? START_STEPS.map((step) =>
        step.when === 'Your plan'
          ? { ...step, title: 'You get a diet chart, a diet plan, a workout plan, and guidance for sleep, cardio, and supplements.' }
          : step
      )
    : START_STEPS
  const faq = durationOffer
    ? FAQ.map((item) => {
        if (item.q === 'What does coaching cost?') {
          const one = sale.quote('offer_1_month')!
          const three = sale.quote('offer_3_months')!
          return {
            ...item,
            a: `1 month is ${one.payLabel}, under ₹${one.perDay} a day. 3 months is ${three.payLabel}, under ₹${three.perDay} a day. ${DURATION_OFFER_EXTRA}`,
          }
        }
        if (item.q === 'Why are the rates this low?') {
          const one = sale.quote('offer_1_month')!
          return {
            ...item,
            a: `This is online coaching in the app: a plan written for you, check-ins, and coach chat. It is not a trainer standing with you in person every session. 1 month is ${one.payLabel}.`,
          }
        }
        if (item.q === 'What happens after I pay?') {
          return {
            ...item,
            a: `${FIRST_PLAN_TARGET} ${DURATION_OFFER_RECEIVE} A few form clips are free in the app. The full library is a separate purchase.`,
          }
        }
        return item
      })
    : FAQ

  return (
    <div className={['lxo', durationOffer ? 'lxo-duration' : '', adPath === PREVIEW5_AD_PATH ? 'lxo-sale' : ''].filter(Boolean).join(' ')} ref={rootRef}>
      {adPath === PREVIEW2_AD_PATH ? (
        <PreviewAdCapture
          path={PREVIEW2_AD_PATH}
          sections={PREVIEW2_DROPOFF_SECTIONS}
          funnelSource="preview2"
          viewKey="lx_preview2_view"
        />
      ) : null}
      {adPath === PREVIEW5_AD_PATH ? (
        <PreviewAdCapture
          path={PREVIEW5_AD_PATH}
          sections={PREVIEW5_DROPOFF_SECTIONS}
          funnelSource="preview5"
          viewKey="lx_preview5_view"
        />
      ) : null}
      <div className="lxo-progress" ref={progressRef} aria-hidden="true" />

      <header className="lxo-header">
        <a href="#top" className="lxo-logo">
          LURVOX
        </a>
        <a className="lxo-login" href="/login">
          {adPath ? 'Client login' : 'Log in'}
        </a>
      </header>

      <main>
        <section className={goal.slug === '6_months' || goal.slug === 'offer_3_months' ? 'lxo-hero' : 'lxo-hero is-bright'} id="top">
          <div className="lxo-hero-media" aria-hidden="true">
            {goals.map((item) => (
              <img
                key={item.slug}
                src={item.image}
                alt=""
                className={item.slug === goal.slug ? 'is-on' : undefined}
                style={{ objectPosition: item.focus }}
                loading="eager"
                fetchPriority={item.slug === goals[0].slug ? 'high' : 'auto'}
              />
            ))}
          </div>
          <div className="lxo-hero-copy">
            {adPath === PREVIEW5_AD_PATH ? <SaleEndsTimer tone="dark" /> : null}
            <p className="lxo-kicker">Online coaching · Piyush&apos;s method</p>
            <h1 key={goal.slug}>{goal.title}</h1>
            <p className="lxo-sub">
              {durationOffer
                ? `The same coaching. ${DURATION_OFFER_EXTRA}`
                : `A workout and diet written for you. In your phone within ${INSTANT_PLAN_WINDOW_LABEL} of finishing onboarding.`}
            </p>
            <div className="lxo-goals" role="tablist" aria-label={durationOffer ? 'Choose how long' : 'Choose your goal'}>
              {goals.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  role="tab"
                  aria-selected={item.slug === goal.slug}
                  className={item.slug === goal.slug ? 'is-on' : undefined}
                  onPointerDown={() => pickPlan(item.slug)}
                  onClick={() => pickPlan(item.slug)}
                >
                  <span>{item.label}</span>
                  <strong>{durationOffer ? payFor(item.slug) : getCoachingPlan(item.slug)?.displayPrice}</strong>
                </button>
              ))}
            </div>
            <div className="lxo-cta">
              <PrimaryCta plan={goal.slug} className="lxo-btn" source={ctaSource} landingPath={ctaLanding} onPay={openPay}>
                {startLabel}
              </PrimaryCta>
              <p className="lxo-meta">
                <span className="lxo-live">Plan within {INSTANT_PLAN_WINDOW_LABEL} of onboarding</span>
                <span>
                  {goal.length} · {durationOffer ? `under ₹${sale.quote(goal.slug)!.perDay} a day` : perDay(goal)}
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="lxo-punch" id="why">
          <p className="lxo-rise lxo-big">Tired of no results?</p>
          <p className="lxo-rise lxo-big lxo-accent">It&apos;s time to change it.</p>
          <div className="lxo-daily">
            {daily.map((item) => (
              <article className="lxo-rise lxo-row" key={item.title}>
                <img src={item.image} alt={item.alt} loading="lazy" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lxo-journey" id="method">
          <h2 className="lxo-rise lxo-moment">
            <span>No perfect moment will come.</span>
            <span>Only what you have is now.</span>
          </h2>
          <ol className="lxo-rail" ref={railRef}>
            {steps.map((step) => (
              <li key={step.title}>
                <span className="lxo-when">{step.when}</span>
                <strong>{step.title}</strong>
              </li>
            ))}
          </ol>
          <div className="lxo-inline-cta lxo-rise">
            <PrimaryCta plan={goal.slug} className="lxo-btn" source={ctaSource} landingPath={ctaLanding} onPay={openPay}>
              Start now for {payFor(goal.slug)}
            </PrimaryCta>
          </div>
        </section>

        <section className="lxo-coaches" id="coaching">
          <blockquote className="lxo-voice lxo-rise">
            <p>We looked fat. No confidence. No support.</p>
            <p>We learned on our own, the hard way, so you don&apos;t have to.</p>
            <footer>Piyush</footer>
          </blockquote>
          <div className="lxo-coach-list">
            {coaches.map((coach) => (
              <article className="lxo-rise lxo-coach" key={coach.key}>
                <BeforeAfter coach={coach} />
                <div className="lxo-coach-name">
                  <h3>{coach.name}</h3>
                  <a href={coach.href} target="_blank" rel="noopener noreferrer">
                    {coach.handle}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lxo-pricing" id="pricing">
          <h2 className="lxo-rise">{durationOffer ? 'The starter, or the finisher.' : 'Pick your plan.'}</h2>
          <div className="lxo-plans">
            {goals.map((item) => {
              const details = getCoachingPlan(item.slug)!
              const priced = durationOffer ? sale.quote(item.slug) : null
              const cardPoints = durationOffer
                ? durationOfferCardPoints(details.durationMonths)
                : pointsFor(item.slug)
              return (
                <article
                  key={item.slug}
                  className={['lxo-rise', 'lxo-plan', item.slug === '12_months' || item.slug === 'offer_3_months' ? 'is-featured' : '', item.slug === goal.slug ? 'is-chosen' : ''].filter(Boolean).join(' ')}
                  onClick={() => pickPlan(item.slug)}
                >
                  <div className="lxo-plan-top">
                    <p>
                      {item.length}
                      {durationOffer && durationOfferCardTag(details.durationMonths) ? (
                        <em>{durationOfferCardTag(details.durationMonths)}</em>
                      ) : null}
                      {!durationOffer && item.slug === '6_months' ? <em>Weekly rewrites</em> : null}
                      {!durationOffer && item.slug === '12_months' ? <em>Lowest monthly</em> : null}
                    </p>
                    <h3>{durationOffer ? durationOfferCardTitle(details.durationMonths) : details.name}</h3>
                  </div>
                  <p className="lxo-plan-price">
                    {priced?.applied ? <s>{priced.listLabel}</s> : null}
                    {priced ? priced.payLabel : details.displayPrice}
                    <span>
                      {priced
                        ? durationOfferCardPriceNote(priced.payPaise, details.durationMonths)
                        : `${item.monthly} · ${perDay(item)}`}
                    </span>
                  </p>
                  <ul>
                    {cardPoints.map((point) => (
                      <li key={point.text} className={point.gold ? 'is-gold' : undefined}>
                        {point.text}
                        {point.note ? <em>{point.note}</em> : null}
                      </li>
                    ))}
                  </ul>
                  <PrimaryCta plan={item.slug} className="lxo-btn" source={ctaSource} landingPath={ctaLanding} onPay={openPay}>
                    Start for {priced ? priced.payLabel : details.displayPrice}
                  </PrimaryCta>
                </article>
              )
            })}
          </div>
        </section>

        <section className="lxo-faq" id="faq">
          <h2 className="lxo-rise">Quick answers</h2>
          {faq.map((item) => (
            <details key={item.q} className="lxo-rise">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
          <p className="lxo-terms">
            <a href="/terms#payments-refunds-guarantees">Read the Terms</a>
          </p>
        </section>

        <section className="lx-final lxo-close" id="close">
          <p className="lxo-rise lxo-big">
            {durationOffer ? 'A month from now, you\'ll wish you started today.' : 'A year from now, you\'ll wish you started today.'}
          </p>
          <div className="lxo-rise lxo-close-cta">
            <PrimaryCta plan={goal.slug} className="lxo-btn lxo-btn-light" source={ctaSource} landingPath={ctaLanding} onPay={openPay}>
              {startLabel}
            </PrimaryCta>
            <p className="lxo-meta">
              <span className="lxo-live">Plan within {INSTANT_PLAN_WINDOW_LABEL} of onboarding</span>
            </p>
          </div>
        </section>
      </main>

      <footer className="lxo-footer">
        <strong>LURVOX</strong>
        <p>Online fitness coaching.</p>
        <p>14, Sector 44, Golf Course Road, Gurugram, Haryana 122003</p>
        <p>
          <a href="mailto:hello@lurvox.in">hello@lurvox.in</a> · <a href="/terms">Terms</a> ·{' '}
          <a href="/refund-policy">Refund policy</a>
        </p>
        <p>Secure payments via Razorpay. Results vary.</p>
      </footer>

      <div className={stickyOn ? 'lxo-sticky is-on' : 'lxo-sticky'} aria-hidden={!stickyOn}>
        <PrimaryCta plan={goal.slug} className="lxo-btn" source={ctaSource} landingPath={ctaLanding} onPay={openPay}>
          {startLabel}
        </PrimaryCta>
        <span className="lxo-live">Plan within {INSTANT_PLAN_WINDOW_LABEL} of onboarding</span>
      </div>
      {durationOffer && adPath ? (
        <DirectCheckout
          planSlug={payPlan}
          landingPath={adPath}
          source={ctaSource}
          tone="purple"
          onClose={() => setPayPlan(null)}
        />
      ) : null}
    </div>
  )
}
