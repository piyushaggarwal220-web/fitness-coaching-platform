'use client'

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { trackFunnelStep } from '@/lib/analytics/funnel'
import { persistMetaClickIdsFromLocation } from '@/lib/analytics/meta-attribution'
import Link from 'next/link'
import { CheckoutFunnelLink } from '@/components/analytics/CheckoutFunnelLink'
import { AnimatedTransformations } from '@/components/landing/AnimatedTransformations'
import { InstantFitnessQuiz } from '@/components/landing/InstantFitnessQuiz'
import { PreviewAdCapture } from '@/components/studio/PreviewAdCapture'
import { PREVIEW3_DROPOFF_SECTIONS, PREVIEW10_AD_PATH } from '@/lib/analytics/ad-landing'
import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'

const LANDING = PREVIEW10_AD_PATH

const PORTRAIT = {
  piyush: '/landing/coach-piyush-dark.webp',
} as const

const GOAL_HERO: Record<
  CoachingPlanSlug,
  { label: string; before: string; accent: string; after: string; line: string }
> = {
  '3_months': {
    label: 'Fat loss',
    before: 'The ',
    accent: '90 days',
    after: ' you keep putting off.',
    line: 'A workout and diet for fat loss. A new plan every 14 days.',
  },
  '6_months': {
    label: 'Muscle',
    before: 'Six months to ',
    accent: 'lose fat and build muscle.',
    after: '',
    line: 'A new plan every week, with cardio and supplements.',
  },
  '12_months': {
    label: 'Athletic',
    before: 'A year of training ',
    accent: 'like an athlete.',
    after: '',
    line: 'Weekly plans for 12 months, plus stamina coaching.',
  },
}

type StorefrontCoach = {
  key: 'piyush'
  name: string
  handle: string
  href: string
}

type PlanCard = {
  slug: CoachingPlanSlug
  chip: string
  length: string
  monthly: string
  tone: 'fat' | 'mid' | 'athletic'
  tag?: string
  note: string
  points: string[]
  extras?: { label: string; items: string[] }
  cta: string
}

const SHARED = [
  'Personal workout and diet',
  'Mid-week and weekly check-ins',
  'Coach chat in the app',
  'Daily trackers, Journey, and progress photos',
]

const PLANS: PlanCard[] = [
  {
    slug: '3_months',
    chip: 'Fat loss · 3 months',
    length: '3 months',
    monthly: '≈ ₹200/mo',
    tone: 'fat',
    note: 'Fat loss. A new workout and diet every 14 days.',
    points: ['New plan every 14 days', ...SHARED],
    cta: 'Get 3 months',
  },
  {
    slug: '6_months',
    chip: 'Fat loss + muscle · 6 months',
    length: '6 months',
    monthly: '≈ ₹167/mo',
    tone: 'mid',
    tag: 'Most popular',
    note: 'Fat loss + muscle. A new workout and diet every week, plus cardio and supplements.',
    points: ['New plan every week', 'Cardio and supplements', ...SHARED],
    extras: {
      label: 'At no extra cost',
      items: ['Muscle programming', 'Weekly plan updates', 'Cardio and supplements'],
    },
    cta: 'Get 6 months',
  },
  {
    slug: '12_months',
    chip: 'Athletic body · 12 months (weight gain included)',
    length: '12 months',
    monthly: '≈ ₹142/mo · lowest monthly cost',
    tone: 'athletic',
    tag: 'Best value',
    note: 'Athletic body. Weekly plans for a full year, plus stamina coaching.',
    points: ['New plan every week', 'Stamina coaching', 'Cardio and supplements', ...SHARED],
    extras: {
      label: '12-month athletic runway',
      items: ['Stamina coaching', 'Lowest ₹/month'],
    },
    cta: 'Get 12 months',
  },
]

const POINT_ROWS = Math.max(...PLANS.map((plan) => plan.points.length))

const FAIL = [
  'The same template for everyone',
  'Sweating more and calling it fat loss',
  'Random YouTube workouts with no weekly structure',
  'Crash diets that crash your energy',
  'Ignoring sleep, water, and recovery',
  'Switching programs every few days, before the current one can work',
]

const WIN = [
  'A workout and diet written for your goal, food, and schedule',
  '3-month plans rewritten every 14 days',
  '6- and 12-month plans rewritten every week',
  'Check-ins so the next plan matches what you actually did',
  'Daily trackers for meals, workouts, sleep, and water',
  'Gym or home. Beginners, vegetarian, vegan, and mixed diets',
]

const FAQ = [
  {
    q: 'What happens after I pay?',
    a: 'Razorpay confirms the payment. We email a secure account link. Create your login, finish the short assessment, and add front, side, and back photos. The first workout and diet usually arrives in the app within 1–2 hours of those photos.',
  },
  {
    q: 'How do you make sure I get what I paid for?',
    a: 'Your purchase is recorded against your email. The plan sits in the app under My Plan, and we email you when it is ready. Refunds are only as written in the Terms.',
  },
  {
    q: 'What exactly is included?',
    a: 'Every plan includes a personal workout and diet, mid-week and weekly check-ins, coach chat, daily trackers, Journey, and progress photos. This is not a one-time PDF. The 3-month plan is rewritten every 14 days. The 6- and 12-month plans are rewritten every week. Six months adds cardio and supplements. Twelve months adds stamina coaching. One price. No weekly phone calls.',
  },
  {
    q: 'Is this real 1-to-1 coaching?',
    a: 'Yes. You get your own plan, your own check-ins, and chat in the app. It is not a weekly phone call, and a trainer is not with you in the gym. For an account problem, message Coach Piyush on Instagram.',
  },
  {
    q: 'Gym or home? Beginners? Vegetarians?',
    a: 'All welcome. Plans are built for gym, home, or mixed setups, matched to your experience, with food for vegetarian, vegan, and allergy needs. You choose the goal in the app after payment. Longer plans unlock more goals.',
  },
  {
    q: 'What if I want a refund?',
    a: 'If you do not see a visible change in your progress photos within 30 days of your first plan, you can ask for the full plan fee back. The rules are in the Terms.',
  },
]

function Stamp() {
  return (
    <div className="lx3-stamp" aria-label="Plan fee back if there is no visible change in 30 days">
      <span>
        <b>30 days</b>
        <strong>Fee back</strong>
        <b>If no change</b>
      </span>
    </div>
  )
}

function PlanLink({
  plan,
  className,
  children,
}: {
  plan: PlanCard
  className: string
  children: ReactNode
}) {
  const catalog = COACHING_PLANS[plan.slug]
  return (
    <CheckoutFunnelLink
      plan={plan.slug}
      planName={catalog.name}
      value={catalog.amountPaise / 100}
      source="preview10"
      landingPath={LANDING}
      className={className}
    >
      {children}
    </CheckoutFunnelLink>
  )
}

/** Before-and-after photos and captions already used on the beige landing. */
const CLIENT_RESULTS = [
  {
    id: '01',
    src: '/images/client-results/01.jpg',
    title: 'Sunil Ajmeri, 54',
    change: 'Businessman with a busy schedule. Lost 11 kg in 4 months.',
    alt: 'Sunil Ajmeri, 54, before with a larger midsection and after looking leaner in a black tank.',
  },
  {
    id: '02',
    src: '/images/client-results/02.jpg',
    title: 'Sumit Tagore, 27',
    change: 'Gained 7 kg in 120 days.',
    alt: 'Sumit Tagore, 27, before very lean and after with more muscle in a white tank.',
  },
  {
    id: '03',
    src: '/images/client-results/03.jpg',
    title: 'Jetu Naik, 45',
    change: 'Businessman with a tight schedule. Lost 7 kg in 90 days.',
    alt: 'Jetu Naik, 45, before with a larger midsection and after in a black t-shirt.',
  },
  {
    id: '04',
    src: '/images/client-results/04.jpg',
    title: 'Neha Sinha, 23',
    change: 'UPSC aspirant. Lost over 9 kg in 4 months.',
    alt: 'Neha Sinha, 23, before in a grey t-shirt and after in a black sports bra and leggings.',
  },
  {
    id: '05',
    src: '/images/client-results/05.jpg',
    title: '79 kg to 65 kg.',
    change: 'Mom of 3 kids, at 43, with a home diet and no supplements.',
    alt: 'Woman, labeled before 79 kg and after 65 kg.',
  },
  {
    id: '06',
    src: '/images/client-results/06.jpg',
    title: 'Delip Singh, 27',
    change: 'A corporate job didn’t stop him from losing 23 kg.',
    alt: 'Delip Singh, 27, before in a striped polo and after in an olive tank.',
  },
  {
    id: '07',
    src: '/images/client-results/07.jpg',
    title: 'Usha Matre, 46',
    change: 'Housewife. Lost 12 kg in only 4 months, on a natural home diet.',
    alt: 'Usha Matre, 46, before in a pink kurta and after in a blue t-shirt.',
  },
  {
    id: '08',
    src: '/images/client-results/08.jpg',
    title: 'Belly down. Abs visible.',
    change: 'The belly is much smaller. The abs are visible, and the chest, shoulders, and arms are fuller.',
    alt: 'Young man, before with a larger midsection and after shirtless with visible abs.',
  },
  {
    id: '09',
    src: '/images/client-results/09.jpg',
    title: 'Laxman Gupta, 24',
    change: 'Lost 23 kg in 6 months with us.',
    alt: 'Laxman Gupta, 24, before in a brown t-shirt with a larger midsection and after leaner in a navy t-shirt.',
  },
  {
    id: '10',
    src: '/images/client-results/10.jpg',
    title: 'Akansha Solase, 19',
    change: 'Lost 13 kg in 140 days with us.',
    alt: 'Akansha Solase, 19, before in a black t-shirt and maroon pants and after in a blue sports bra with visible abs.',
  },
  {
    id: '11',
    src: '/images/client-results/11.jpg',
    title: 'Anmol Kapoor, 62',
    change: 'Reversed diabetes and lost 16 kg in 200 days.',
    alt: 'Anmol Kapoor, 62, before in a light blue polo with a larger belly and after in a black t-shirt.',
  },
  {
    id: '12',
    src: '/images/client-results/12.jpg',
    title: 'Deeksha Sinha, 26',
    change: 'A sitting job didn’t stop her from losing 11 kg.',
    alt: 'Deeksha Sinha, 26, before in a lilac t-shirt and grey pants and after in a black t-shirt and leggings.',
  },
  {
    id: '13',
    src: '/images/client-results/13.jpg',
    title: 'Subhash More, 49',
    change: 'Business owner from Odisha. Lost 9 kg in 100 days.',
    alt: 'Subhash More, 49, before in a white vest and after in a navy tank.',
  },
  {
    id: '14',
    src: '/images/client-results/14.jpg',
    title: 'Harsh Kamra',
    change: 'Gained 5 kg in 120 days with us, despite a busy college life.',
    alt: 'Harsh Kamra, labeled day 1 in a grey tank and day 120 with more muscle in a black tank.',
  },
]

function ResultSwipe() {
  const scroller = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0)
  const heldRef = useRef(false)
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)

  function cardLeft(el: HTMLElement, card: HTMLElement) {
    return card.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
  }

  function hold() {
    if (heldRef.current) return
    heldRef.current = true
    setHeld(true)
    const el = scroller.current
    if (!el) return
    el.style.scrollSnapType = ''
    el.scrollTo({ left: el.scrollLeft, behavior: 'auto' })
  }

  function noteGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (heldRef.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    const stopListening = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      const dx = Math.abs(e.clientX - startX)
      const dy = Math.abs(e.clientY - startY)
      if (dx < 10 && dy < 10) return
      stopListening()
      if (dx > dy) hold()
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      const dx = Math.abs(e.clientX - startX)
      const dy = Math.abs(e.clientY - startY)
      stopListening()
      if (dx < 10 && dy < 10) hold()
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      stopListening()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  function nearestIndex() {
    const el = scroller.current
    if (!el) return 0
    let best = 0
    let bestDist = Number.POSITIVE_INFINITY
    Array.from(el.children).forEach((node, i) => {
      const dist = Math.abs(cardLeft(el, node as HTMLElement) - el.scrollLeft)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    return best
  }

  useEffect(() => {
    indexRef.current = index
  }, [index])

  useEffect(() => {
    if (held) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = scroller.current
    if (!el) return
    let frame = 0

    function visible() {
      const rect = el.getBoundingClientRect()
      const shown = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
      return shown > 80
    }

    function animateTo(left: number, done: () => void) {
      window.cancelAnimationFrame(frame)
      const start = el.scrollLeft
      const delta = left - start
      if (Math.abs(delta) < 2) {
        done()
        return
      }
      const duration = 700
      const t0 = performance.now()
      el.style.scrollSnapType = 'none'
      const step = (now: number) => {
        if (heldRef.current) {
          el.style.scrollSnapType = ''
          return
        }
        const progress = Math.min(1, (now - t0) / duration)
        const eased = 1 - (1 - progress) ** 3
        el.scrollLeft = start + delta * eased
        if (progress < 1) frame = window.requestAnimationFrame(step)
        else {
          el.style.scrollSnapType = ''
          done()
        }
      }
      frame = window.requestAnimationFrame(step)
    }

    let timer = 0
    function queue(delay: number) {
      timer = window.setTimeout(advance, delay)
    }
    function advance() {
      if (heldRef.current) return
      if (!visible()) {
        queue(200)
        return
      }
      const next = (indexRef.current + 1) % CLIENT_RESULTS.length
      const card = el.children[next] as HTMLElement | undefined
      if (!card) return
      animateTo(card.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft, () => queue(1000))
    }
    queue(1000)

    return () => {
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
      el.style.scrollSnapType = ''
    }
  }, [held])

  function go(next: number) {
    const el = scroller.current
    const card = el?.children[next] as HTMLElement | undefined
    if (!el || !card) return
    el.scrollTo({
      left: cardLeft(el, card),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const fit = () => {
      const next = nearestIndex()
      setIndex((current) => (current === next ? current : next))
      const card = el.children[next] as HTMLElement | undefined
      if (!card) return
      const height = `${card.offsetHeight}px`
      if (el.style.height !== height) el.style.height = height
    }
    fit()
    const images = Array.from(el.querySelectorAll('img'))
    images.forEach((img) => {
      if (!img.complete) img.addEventListener('load', fit)
    })
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => {
      images.forEach((img) => img.removeEventListener('load', fit))
      observer.disconnect()
    }
  }, [index])

  const tall = new Set(['05', '10', '12'])

  return (
    <section className="lx3-voices" id="voices" aria-roledescription="carousel" aria-labelledby="lx3-voices-title">
      <p className="lx3-eyebrow">Clients</p>
      <h2 id="lx3-voices-title">Before and after.</h2>
      <p className="lx3-voices-note">Client photos. Results vary.</p>
      <div className="lx3-stage">
        <div
          className="lx3-swipe"
          ref={scroller}
          tabIndex={0}
          onPointerDown={noteGesture}
          onWheel={(event) => {
            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) hold()
          }}
          onScroll={() => {
            const next = nearestIndex()
            setIndex((current) => (current === next ? current : next))
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
            hold()
            if (event.key === 'ArrowRight') go(Math.min(index + 1, CLIENT_RESULTS.length - 1))
            if (event.key === 'ArrowLeft') go(Math.max(index - 1, 0))
          }}
          aria-label="Before and after photos"
        >
          {CLIENT_RESULTS.map((item, i) => (
            <figure key={item.id} aria-hidden={i === index ? undefined : true}>
              <img
                src={item.src}
                alt={item.alt}
                width={1024}
                height={tall.has(item.id) ? 935 : 682}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
              <figcaption>
                <strong>{item.title}</strong>
                <span>{item.change}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="lx3-voices-count">
        <button type="button" aria-label="Previous result" disabled={index === 0} onPointerDown={hold} onClick={() => go(index - 1)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" />
          </svg>
        </button>
        <p aria-live={held ? 'polite' : 'off'}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span className="lx3-voices-track" aria-hidden="true">
            <span style={{ width: `${((index + 1) / CLIENT_RESULTS.length) * 100}%` }} />
          </span>
          <span>{String(CLIENT_RESULTS.length).padStart(2, '0')}</span>
        </p>
        <button
          type="button"
          aria-label="Next result"
          disabled={index === CLIENT_RESULTS.length - 1}
          onPointerDown={hold}
          onClick={() => go(index + 1)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7.5 4.5 13 10l-5.5 5.5" />
          </svg>
        </button>
      </div>
    </section>
  )
}

const CALL_BOOKED_KEY = 'lurvox_consult_booked'
const CALL_MESSAGE = 'Please call me. I want to talk to Coach Piyush about LURVOX coaching.'

function TalkToCoach() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState(false)

  useEffect(() => {
    try {
      setBooked(window.localStorage.getItem(CALL_BOOKED_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    persistMetaClickIdsFromLocation()
    trackFunnelStep('talk_to_coach', { source: 'preview10', path: '/preview10' })
    try {
      const res = await fetch('/api/public/talk-to-a-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, message: CALL_MESSAGE }),
      })
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !payload?.ok) {
        setError(payload?.error ?? 'Could not send. Please try again.')
        setLoading(false)
        return
      }
      setBooked(true)
      try {
        window.localStorage.setItem(CALL_BOOKED_KEY, '1')
      } catch {
        /* ignore */
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  return (
    <section className="lx3-talk" id="talk" aria-labelledby="lx3-talk-title">
      <p className="lx3-eyebrow">Free call</p>
      <h2 id="lx3-talk-title">Talk to a coach.</h2>
      {booked ? (
        <div className="lx3-talk-card">
          <p className="lx3-talk-done">Call booked.</p>
          <p className="lx3-plans-lede">A coach will call you on this number. The call is free and does not start a plan.</p>
        </div>
      ) : (
        <form className="lx3-talk-card" onSubmit={submit}>
          <p className="lx3-plans-lede">Name and WhatsApp number. A coach calls you. No payment.</p>
          <label>
            Name
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
              minLength={2}
            />
          </label>
          <label>
            WhatsApp number
            <input
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              required
            />
          </label>
          {error ? <p className="lx3-talk-error">{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Request a call'}
          </button>
          <p className="lx3-talk-note">Free. Paying later is what starts your plan.</p>
        </form>
      )}
    </section>
  )
}

function planBySlug(slug: CoachingPlanSlug) {
  const plan = PLANS.find((item) => item.slug === slug)
  if (!plan) throw new Error(`Missing plan ${slug}`)
  return plan
}

export function Preview10Storefront({ coaches }: { coaches: StorefrontCoach[] }) {
  const [sticky, setSticky] = useState(false)
  const goalSlug: CoachingPlanSlug = '6_months'
  const goal = GOAL_HERO[goalSlug]
  const goalPlan = planBySlug(goalSlug)

  useEffect(() => {
    const onScroll = () => {
      const plans = document.getElementById('plans')
      const footer = document.getElementById('close')
      const plansBottom = plans?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY
      const closeTop = footer?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
      setSticky(plansBottom < 72 && closeTop > window.innerHeight - 72)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div className="lx3 lx3-store">
      <header className="lx3-bar">
        <a className="lx3-brand" href="#top">
          <span className="lx3-brand-name">LURVOX</span>
          <span className="lx3-brand-line">India&apos;s best human coaching app</span>
        </a>
        <nav className="lx3-bar-nav" aria-label="Page">
          <a href="#plans">Plans</a>
          <a href="#voices">Results</a>
          <a href="#talk">Talk</a>
          <a href="#steps">How it works</a>
          <a href="#quiz">Quiz</a>
          <a href="#faq">Questions</a>
        </nav>
        <details className="lx3-bar-menu">
          <summary aria-label="Open menu">
            <span aria-hidden="true" />
          </summary>
          <nav aria-label="Page">
            <a href="#plans" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Plans</a>
            <a href="#voices" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Results</a>
            <a href="#talk" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Talk</a>
            <a href="#steps" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>How it works</a>
            <a href="#quiz" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Quiz</a>
            <a href="#faq" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Questions</a>
          </nav>
        </details>
        <Link className="lx3-bar-login" href="/login">Log in</Link>
      </header>
      <PreviewAdCapture
        path={LANDING}
        sections={PREVIEW3_DROPOFF_SECTIONS}
        funnelSource="preview10"
        viewKey="lx_preview10_view"
      />

      <section className="lx3-hero lx3-hero-goal" id="top" aria-labelledby="lx3-title">
        <div className="lx3-goal-layout">
          {coaches[0] ? (
            <div className="lx3-coach-stage">
              <figure className="lx3-portrait">
                <a
                  className="lx3-photo"
                  href={coaches[0].href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${coaches[0].name} on Instagram ${coaches[0].handle}`}
                >
                  <img src={PORTRAIT[coaches[0].key]} alt={`${coaches[0].name}, LURVOX coach`} width={400} height={533} />
                </a>
                <figcaption>
                  <strong>{coaches[0].name.split(' ')[0]}</strong>
                  <a href={coaches[0].href} target="_blank" rel="noopener noreferrer">{coaches[0].handle}</a>
                </figcaption>
              </figure>
              <p className="lx3-hint">Tap the photo to open Instagram</p>
              <div className="lx3-people">
                <p>Transformed over 7000 people</p>
                <span>First plan usually within 1–2 hours of your photos</span>
              </div>
            </div>
          ) : null}
          <div className="lx3-goal-copy">
            <p className="lx3-guarantee">
              Visible change in 30 days, or your plan fee back.{' '}
              <Link href="/terms#payments-refunds-guarantees">Terms</Link>
            </p>
            <h1 id="lx3-title">
              {goal.before}<span>{goal.accent}</span>{goal.after}
            </h1>
            <p className="lx3-lede">{goal.line}</p>
            <ul className="lx3-trust">
              <li>Trackers, coach chat, Journey included</li>
              <li>Beginner friendly</li>
              <li>Not a one-time PDF</li>
            </ul>
            <div className="lx3-offers" aria-label="Choose a plan">
              {PLANS.map((plan) => (
                <PlanLink key={plan.slug} plan={plan} className={`lx3-offer lx3-offer-${plan.tone}`}>
                  <span>
                    {plan.tag === 'Most popular' ? <em>Most popular</em> : null}
                    {plan.chip}
                  </span>
                  <strong>{COACHING_PLANS[plan.slug].displayPrice}</strong>
                </PlanLink>
              ))}
            </div>
          </div>
        </div>
        <div className="lx3-stamp-row">
          <Stamp />
        </div>
      </section>

      <section className="lx3-plans" id="plans" aria-label="Plans">
        <div className="lx3-stack">
          {PLANS.map((plan) => (
            <article key={plan.slug} className={`lx3-card lx3-card-${plan.tone}`}>
              <p
                className={`lx3-tag${plan.tone === 'athletic' ? ' lx3-tag-best' : ''}${plan.tag ? '' : ' lx3-tag-spacer'}`}
                aria-hidden={plan.tag ? undefined : true}
              >
                {plan.tag ?? 'Best value'}
              </p>
              <span className="lx3-dur">{plan.length}</span>
              <h3>{COACHING_PLANS[plan.slug].name}</h3>
              <p className="lx3-price">{COACHING_PLANS[plan.slug].displayPrice}</p>
              <p className="lx3-meta">{plan.monthly}</p>
              <p className={`lx3-note${plan.tone === 'athletic' ? ' lx3-note-gold' : ''}`}>{plan.note}</p>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
                {Array.from({ length: POINT_ROWS - plan.points.length }, (_, index) => (
                  <li key={`pad-${index}`} className="lx3-point-pad" aria-hidden="true">
                    Included
                  </li>
                ))}
              </ul>
              {plan.extras ? (
                <div className={`lx3-extras${plan.tone === 'athletic' ? ' lx3-extras-gold' : ''}`}>
                  <p>
                    <span>{plan.tone === 'athletic' ? 'PLUS' : 'INCLUDED'}</span>
                    {plan.extras.label}
                  </p>
                  <ul>
                    {plan.extras.items.map((item) => (
                      <li key={item}>
                        <em>PLUS</em>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <PlanLink plan={plan} className="lx3-cta">
                {plan.cta} · {COACHING_PLANS[plan.slug].displayPrice}
              </PlanLink>
            </article>
          ))}
        </div>
      </section>

      <ResultSwipe />
      <TalkToCoach />

      <section className="lx3-truth" id="truth" aria-labelledby="lx3-truth-title">
        <p className="lx3-eyebrow lx3-eyebrow-orange">Truth check</p>
        <h2 id="lx3-truth-title">Why most plans fail</h2>
        <p className="lx3-plans-lede">
          A template is not a plan. Yours is rewritten on a schedule, from your check-ins.
        </p>
        <div className="lx3-truth-grid">
          <article className="lx3-truth-fail">
            <p>Why plans fail</p>
            <ul>
              {FAIL.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="lx3-truth-win">
            <p>What you get here</p>
            <ul>
              {WIN.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="lx3-steps" id="steps" aria-labelledby="lx3-steps-title">
        <p className="lx3-eyebrow lx3-eyebrow-orange">How it works</p>
        <h2 id="lx3-steps-title">Your plan in 3 steps</h2>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Pay once</strong>
              <p>Checkout with Razorpay. UPI, cards, or netbanking. You get an email with every next step.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Tell us about you</strong>
              <p>Short assessment in the app, plus front, side, and back photos so the plan matches your body. The photos stay in your coaching.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Receive your plan</strong>
              <p>Usually within 1–2 hours of your photos. Then every 14 days on the 3-month plan, and every week on the 6- and 12-month plans.</p>
            </div>
          </li>
        </ol>
      </section>

      <div id="changes">
        <AnimatedTransformations
          eyebrow="Expected changes"
          heading="Within 30 days of consistent work"
          lede="Skinny to bulky. Fat to shredded. Soft to toned. Men and women. Results vary."
        />
      </div>

      <div id="quiz" className="lx3-quiz">
        <InstantFitnessQuiz offer="coaching" fromLabel="See plans — ₹599 · ₹999 · ₹1,699" />
      </div>

      <section className="lx3-faq" id="faq" aria-labelledby="lx3-faq-title">
        <p className="lx3-eyebrow lx3-eyebrow-orange">FAQ</p>
        <h2 id="lx3-faq-title">Questions before you start</h2>
        <p className="lx3-plans-lede">Straight answers on coaching, what is included, and how the system works.</p>
        <div className="lx3-faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>
                {item.a}{' '}
                {item.q.startsWith('How do you') || item.q.startsWith('What if') ? (
                  <Link href="/terms#payments-refunds-guarantees">Terms</Link>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="lx3-close" id="close" aria-label="Choose your plan and start">
        <p className="lx3-eyebrow lx3-eyebrow-orange">Ready to start</p>
        <h2>Most people take 6 months.</h2>
        <p>
          <strong>12 months · ₹1,699</strong> is the lowest monthly cost, with stamina coaching. <strong>6 months · ₹999</strong> is rewritten every week. <strong>3 months · ₹599</strong> is rewritten every 14 days.
        </p>
        <a className="lx3-jump" href="#plans">See plans — ₹599 · ₹999 · ₹1,699</a>
        <div className="lx3-stamp-row">
          <Stamp />
        </div>
        <p className="lx3-stamp-note">Visible change in 30 days, or your plan fee back.</p>
        <div className="lx3-badges" aria-label="Secure checkout">
          <span>Razorpay</span>
          <span>UPI</span>
          <span>Cards</span>
          <span>Netbanking</span>
        </div>
        <div className="lx3-close-actions">
          {PLANS.map((plan) => (
            <PlanLink key={plan.slug} plan={plan} className={`lx3-close-btn lx3-close-${plan.tone}`}>
              {plan.length} · {COACHING_PLANS[plan.slug].displayPrice}
            </PlanLink>
          ))}
        </div>
        <p className="lx3-terms">
          Visible change in 30 days, or your plan fee back. The rules are in the <Link href="/terms#payments-refunds-guarantees">Terms</Link>.
        </p>
        <p className="lx3-coaches">
          Coach{' '}
          {coaches.map((item, index) => (
            <span key={item.key}>
              {index > 0 ? ' · ' : null}
              <a href={item.href} target="_blank" rel="noopener noreferrer">
                {item.name} {item.handle}
              </a>
            </span>
          ))}
        </p>
        <p className="lx3-alt">
          <Link href="/login">Existing client log in</Link>
          {' · '}
          <a href="#quiz">Still deciding? Take the fitness quiz</a>
        </p>
      </section>

      <div className={`lx3-sticky${sticky ? ' is-on' : ''}`}>
        <div>
          <strong>{goalPlan.length}</strong>
          <span>{COACHING_PLANS[goalPlan.slug].displayPrice} · {goalPlan.slug === '3_months' ? 'new plan every 14 days' : 'new plan every week'}</span>
        </div>
        <PlanLink plan={goalPlan} className="lx3-sticky-cta">
          Get {goalPlan.length}
        </PlanLink>
      </div>
    </div>
  )
}
