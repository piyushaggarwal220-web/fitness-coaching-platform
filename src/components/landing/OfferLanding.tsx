'use client'

import { useEffect, useRef, useState } from 'react'
import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'
import { PrimaryCta } from './primitives'

export type CoachResult = {
  key: 'piyush' | 'rakshit'
  name: string
  handle: string
  href: string
  portrait: string
  before: string | null
  after: string | null
}

type Goal = {
  slug: CoachingPlanSlug
  label: string
  title: string
  length: string
  days: number
  monthly: string
  update: string
  finish: string
  image: string
  focus: string
  tier: string
  short: string
}

const GOALS: Goal[] = [
  {
    slug: '3_months',
    label: 'Fat loss',
    title: 'The 90 days you keep putting off.',
    length: '90 days',
    days: 90,
    monthly: '₹200 a month',
    update: 'Every 14 days',
    finish: 'Day 90',
    image: '/images/lurvox/offer/hero-fat-loss.webp',
    focus: 'center 22%',
    tier: 'Basics',
    short: 'Fat loss',
  },
  {
    slug: '6_months',
    label: 'Muscle',
    title: 'Six months to lose fat and build muscle.',
    length: '6 months',
    days: 180,
    monthly: '₹167 a month',
    update: 'Every week',
    finish: 'Month 6',
    image: '/images/lurvox/offer/hero-muscle.webp?v=2',
    focus: 'center 22%',
    tier: 'More',
    short: 'Fat + muscle',
  },
  {
    slug: '12_months',
    label: 'Athletic',
    title: 'A year of training like an athlete.',
    length: '12 months',
    days: 365,
    monthly: '₹142 a month',
    update: 'Every week',
    finish: 'Month 12',
    image: '/images/lurvox/offer/hero-athletic.webp',
    focus: 'center 22%',
    tier: 'Everything',
    short: 'Athletic',
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

type CompareCell = true | false | string

const COMPARE: { label: string; gold?: boolean; cells: Record<CoachingPlanSlug, CompareCell> }[] = [
  { label: 'Workout and diet', cells: { '3_months': true, '6_months': true, '12_months': true } },
  { label: 'Check-ins and coach chat', cells: { '3_months': true, '6_months': true, '12_months': true } },
  { label: 'Daily tracking and photos', cells: { '3_months': true, '6_months': true, '12_months': true } },
  { label: 'Plan rewritten', cells: { '3_months': '14 days', '6_months': 'Weekly', '12_months': 'Weekly' } },
  { label: 'Cardio plan', cells: { '3_months': false, '6_months': true, '12_months': true } },
  { label: 'Supplement plan', cells: { '3_months': false, '6_months': true, '12_months': true } },
  { label: 'Help if progress stalls', cells: { '3_months': false, '6_months': 'From day 90', '12_months': 'All year' } },
  { label: 'Stamina work', cells: { '3_months': false, '6_months': false, '12_months': true } },
  {
    label: 'Testosterone boosting for men',
    gold: true,
    cells: { '3_months': false, '6_months': false, '12_months': true },
  },
  {
    label: 'Hourglass figure for women',
    gold: true,
    cells: { '3_months': false, '6_months': false, '12_months': true },
  },
]

function CompareMark({ value, gold }: { value: CompareCell; gold?: boolean }) {
  if (value === true) {
    return <span className={gold ? 'lxo-tick is-gold' : 'lxo-tick'} role="img" aria-label="Included" />
  }
  if (value === false) return <span className="lxo-miss" aria-label="Not included">—</span>
  return <span className="lxo-cell-note">{value}</span>
}

const PLAN_POINTS: Record<CoachingPlanSlug, { text: string; gold?: boolean }[]> = {
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
    { text: 'Stamina boosted' },
    { text: 'Updated every week' },
    { text: 'Testosterone boosting for men', gold: true },
    { text: 'Hourglass figure for women', gold: true },
  ],
}

const START_STEPS = [
  { when: 'Pay', title: 'Payment is done.' },
  { when: 'Then', title: 'Answer the 25 next questions.' },
  { when: 'Photos', title: 'Give your photos.' },
  { when: '3 hours', title: 'Coach creates your plan in the next 3 hours.' },
  { when: 'Your plan', title: 'Get the diet, workout, sleep, cardio, and supplement guidance.' },
  { when: 'Every day', title: 'Start the daily trackers and the exercise videos.' },
]

const FAQ = [
  {
    q: 'When do I get my plan?',
    a: 'Within 3 hours of answering the questions after you pay.',
  },
  { q: 'Do I need a gym?', a: 'No. The plan uses a gym, home, or a mix, based on what you have.' },
  { q: 'Can I message my coach?', a: 'Yes, in the app, once your coaching is active.' },
  {
    q: 'Can I switch to a longer plan?',
    a: 'Usually, yes. Within 48 hours of buying there is no late upgrade fee. After that it may cost ₹250.',
  },
  {
    q: 'What is the refund policy?',
    a: 'Sales are final once payment is captured, except where the Terms say otherwise.',
  },
]

function perDay(goal: Goal) {
  return `under ₹${Math.ceil(COACHING_PLANS[goal.slug].amountPaise / 100 / goal.days)} a day`
}

function deliveryParts(now: Date) {
  const at = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const zone = 'Asia/Kolkata'
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: zone })
  const hour = Number(at.toLocaleString('en-GB', { timeZone: zone, hour: '2-digit', hour12: false }))
  const clock = at.toLocaleTimeString('en-IN', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
  const phrase = day(at) !== day(now) ? `by ${clock} tomorrow` : `by ${clock}${hour >= 18 ? ' tonight' : ' today'}`
  return { phrase, clock }
}

function useDelivery() {
  const [parts, setParts] = useState<{ phrase: string; clock: string } | null>(null)
  useEffect(() => {
    const tick = () => setParts(deliveryParts(new Date()))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])
  return parts
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

export function OfferLanding({ coaches }: { coaches: CoachResult[] }) {
  const [slug, setSlug] = useState<CoachingPlanSlug>('3_months')
  const rotateTimer = useRef<number | null>(null)
  const heroInView = useRef(true)

  const stopRotation = () => {
    if (rotateTimer.current === null) return
    window.clearInterval(rotateTimer.current)
    rotateTimer.current = null
  }

  const pickPlan = (next: CoachingPlanSlug) => {
    stopRotation()
    setSlug(next)
  }
  const goal = GOALS.find((item) => item.slug === slug) ?? GOALS[0]
  const plan = COACHING_PLANS[goal.slug]
  const delivery = useDelivery()
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
        const index = GOALS.findIndex((item) => item.slug === current)
        return GOALS[(index + 1) % GOALS.length].slug
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
    const blockers = [heroCta, ...root.querySelectorAll('main .lxo-btn'), root.querySelector('#pricing')]
    const seen = new Map<Element, boolean>()
    const sticky = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target, entry.isIntersecting)
        const anyOn = [...seen.values()].some(Boolean)
        const heroGone = heroCta ? seen.get(heroCta) === false : false
        setStickyOn(heroGone && !anyOn)
      },
      { threshold: 0 }
    )
    for (const node of blockers) if (node) sticky.observe(node)

    return () => {
      reveal.disconnect()
      sticky.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const startLabel = `Start for ${plan.displayPrice}`

  return (
    <div className="lxo" ref={rootRef}>
      <div className="lxo-progress" ref={progressRef} aria-hidden="true" />

      <header className="lxo-header">
        <a href="#top" className="lxo-logo">
          LURVOX
        </a>
        <a className="lxo-login" href="/login">
          Log in
        </a>
      </header>

      <main>
        <section className={goal.slug === '6_months' ? 'lxo-hero' : 'lxo-hero is-bright'} id="top">
          <div className="lxo-hero-media" aria-hidden="true">
            {GOALS.map((item) => (
              <img
                key={item.slug}
                src={item.image}
                alt=""
                className={item.slug === goal.slug ? 'is-on' : undefined}
                style={{ objectPosition: item.focus }}
                loading="eager"
                fetchPriority={item.slug === '3_months' ? 'high' : 'auto'}
              />
            ))}
          </div>
          <div className="lxo-hero-copy">
            <p className="lxo-kicker">Online coaching · Piyush &amp; Rakshit&apos;s method</p>
            <h1 key={goal.slug}>{goal.title}</h1>
            <p className="lxo-sub">A workout and diet written for you. In your phone within 3 hours.</p>
            <div className="lxo-goals" role="tablist" aria-label="Choose your goal">
              {GOALS.map((item) => (
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
                  <strong>{COACHING_PLANS[item.slug].displayPrice}</strong>
                </button>
              ))}
            </div>
            <div className="lxo-cta">
              <PrimaryCta plan={goal.slug} className="lxo-btn">
                {startLabel}
              </PrimaryCta>
              <p className="lxo-meta">
                <span className="lxo-live">{delivery ? `Plan ${delivery.phrase}` : 'Plan within 3 hours'}</span>
                <span>
                  {goal.length} · {perDay(goal)}
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="lxo-punch" id="why">
          <p className="lxo-rise lxo-big">Tired of no results?</p>
          <p className="lxo-rise lxo-big lxo-accent">It&apos;s time to change it.</p>
          <div className="lxo-daily">
            {DAILY.map((item) => (
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
          <h2 className="lxo-rise">If you start now, your first 12 days.</h2>
          <ol className="lxo-rail" ref={railRef}>
            {START_STEPS.map((step) => (
              <li key={step.title}>
                <span className="lxo-when">{step.when}</span>
                <strong>{step.title}</strong>
              </li>
            ))}
          </ol>
          <div className="lxo-inline-cta lxo-rise">
            <PrimaryCta plan={goal.slug} className="lxo-btn">
              Start now for {plan.displayPrice}
            </PrimaryCta>
          </div>
        </section>

        <section className="lxo-coaches" id="coaching">
          <p className="lxo-eyebrow lxo-rise">The method comes from</p>
          <h2 className="lxo-rise">Two coaches who did it first.</h2>
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

        <section className="lxo-included" id="system">
          <h2 className="lxo-rise">What each plan includes.</h2>
          <p className="lxo-rise lxo-compare-lead">
            Basics on fat loss. More on fat loss + muscle. Everything on the year plan.
          </p>
          <div className="lxo-rise lxo-table-wrap">
            <table className="lxo-compare">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="lxo-sr">Feature</span>
                  </th>
                  {GOALS.map((item) => (
                    <th key={item.slug} scope="col" className={item.slug === goal.slug ? 'is-on' : undefined}>
                      <button type="button" onClick={() => pickPlan(item.slug)}>
                        <span>{item.tier}</span>
                        <strong>{item.short}</strong>
                        <em>{COACHING_PLANS[item.slug].displayPrice}</em>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label} className={row.gold ? 'is-gold' : undefined}>
                    <th scope="row">{row.label}</th>
                    {GOALS.map((item) => (
                      <td key={item.slug} className={item.slug === goal.slug ? 'is-on' : undefined}>
                        <CompareMark value={row.cells[item.slug]} gold={row.gold && item.slug === '12_months'} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lxo-pricing" id="pricing">
          <h2 className="lxo-rise">Pick your plan.</h2>
          <div className="lxo-plans">
            {GOALS.map((item) => {
              const details = COACHING_PLANS[item.slug]
              return (
                <article
                  key={item.slug}
                  className={['lxo-rise', 'lxo-plan', item.slug === goal.slug ? 'is-chosen' : ''].filter(Boolean).join(' ')}
                  onClick={() => pickPlan(item.slug)}
                >
                  <div className="lxo-plan-top">
                    <p>
                      {item.length}
                      {item.slug === '6_months' ? <em>Most popular</em> : null}
                      {item.slug === '12_months' ? <em>Lowest monthly</em> : null}
                    </p>
                    <h3>{details.name}</h3>
                  </div>
                  <p className="lxo-plan-price">
                    {details.displayPrice}
                    <span>
                      {item.monthly} · {perDay(item)}
                    </span>
                  </p>
                  <ul>
                    {PLAN_POINTS[item.slug].map((point) => (
                      <li key={point.text} className={point.gold ? 'is-gold' : undefined}>
                        {point.text}
                      </li>
                    ))}
                  </ul>
                  <PrimaryCta plan={item.slug} className="lxo-btn">
                    Start for {details.displayPrice}
                  </PrimaryCta>
                </article>
              )
            })}
          </div>
        </section>

        <section className="lxo-faq" id="faq">
          <h2 className="lxo-rise">Quick answers</h2>
          {FAQ.map((item) => (
            <details key={item.q} className="lxo-rise">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
          <p className="lxo-terms">
            <a href="/terms#payments-refunds-guarantees">Read the Terms</a>
          </p>
        </section>

        <section className="lx-final lxo-close">
          <p className="lxo-rise lxo-big">A year from now, you&apos;ll wish you started today.</p>
          <div className="lxo-rise lxo-close-cta">
            <PrimaryCta plan={goal.slug} className="lxo-btn lxo-btn-light">
              {startLabel}
            </PrimaryCta>
            <p className="lxo-meta">
              <span className="lxo-live">{delivery ? `Plan ${delivery.phrase}` : 'Plan within 3 hours'}</span>
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
        <PrimaryCta plan={goal.slug} className="lxo-btn">
          {startLabel}
        </PrimaryCta>
        <span className="lxo-live">{delivery ? `By ${delivery.clock}` : 'In 3 hours'}</span>
      </div>
    </div>
  )
}
