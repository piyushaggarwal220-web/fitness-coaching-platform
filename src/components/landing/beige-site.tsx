'use client'

import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { PreviewAdCapture } from '@/components/studio/PreviewAdCapture'
import { PREVIEW4_AD_PATH, PREVIEW4_DROPOFF_SECTIONS } from '@/lib/analytics/ad-landing'
import { trackFunnelStep } from '@/lib/analytics/funnel'
import { persistMetaClickIdsFromLocation } from '@/lib/analytics/meta-attribution'
import { coaches } from '@/lib/content'
import { INSTANT_PLAN_WINDOW_LABEL } from '@/lib/plan-delivery-window'
import { TRANSFORMATION_PLANS } from '@/lib/payments/plans'
import { DirectCheckout } from './DirectCheckout'
import { PreviewSaleProvider } from './PreviewSaleCode'
import { CampaignImage, PrimaryCta } from './primitives'

const PLAN = TRANSFORMATION_PLANS.offer_84_days
const TALK_HREF = '/preview4/talk'
const CALL_KEY = 'lurvox_preview4_call_booked'
const CALL_MESSAGE = 'Please call me about the 84-day transformation.'

const PayContext = createContext<(plan: string) => void>(() => {})

const PHASES = [
  { n: '01', days: 'Days 1–21', title: 'The first plan', body: 'Workout, diet, and the week you actually have. You log it. The coach can see it.' },
  { n: '02', days: 'Days 22–42', title: 'It moves', body: 'Mid-week and weekly check-ins. The plan changes from what you did, not from a fixed file.' },
  { n: '03', days: 'Days 43–63', title: 'The harder block', body: 'Training and food get more specific. Same coach. Same app.' },
  { n: '04', days: 'Days 64–84', title: 'Hold it', body: 'The last three weeks lock the routine. You leave with the next step written down.' },
] as const

const INCLUDED = [
  'Personal workout plan',
  'Personal diet plan',
  'Sleep, cardio, and supplement guidance',
  'A human coach in the app',
  'Mid-week and weekly check-ins',
  'Workout and diet trackers',
  'Plan updates every week',
  'Testosterone protocol for men',
  'Hourglass guidance for women',
] as const

const FAQ = [
  ['What is this?', 'One block of online coaching. 84 days. One price. A workout plan, a diet plan, check-ins, and a coach in the app.'],
  ['What do I pay?', `${PLAN.displayPrice} once, for 84 days. It is not a monthly charge.`],
  ['When does the plan arrive?', `After onboarding and the required photos, the first plan arrives within ${INSTANT_PLAN_WINDOW_LABEL}.`],
  ['Do I need a gym?', 'No. The plan uses a gym, home, or a mix, based on what you have.'],
  ['Can I talk to a coach before I pay?', 'Yes. Leave your name and WhatsApp number. A coach calls you. That call is free and does not start the 84 days.'],
  ['Can I message my coach?', 'Yes, in the app, once the 84 days are active.'],
  ['What is the refund policy?', 'Sales are final once payment is captured, except where the Terms say otherwise. The Terms are the only refund rules.'],
] as const

export function BeigeSite({ children, capture = false }: { children: ReactNode; capture?: boolean }) {
  const [payPlan, setPayPlan] = useState<string | null>(null)
  return (
    <PreviewSaleProvider>
    <PayContext.Provider value={setPayPlan}>
      <div className="landing lx-duration">
        {capture ? (
          <PreviewAdCapture
            path={PREVIEW4_AD_PATH}
            sections={PREVIEW4_DROPOFF_SECTIONS}
            funnelSource="preview4"
            viewKey="lx_preview4_view"
          />
        ) : null}
        <BeigeNav />
        <main>{children}</main>
        <BeigeFooter />
        <BeigeSticky />
        <DirectCheckout
          planSlug={payPlan}
          landingPath="/preview4"
          source="preview4"
          tone="beige"
          onClose={() => setPayPlan(null)}
        />
      </div>
    </PayContext.Provider>
    </PreviewSaleProvider>
  )
}

function usePay() {
  return useContext(PayContext)
}

function OfferActions() {
  const pay = usePay()
  return (
    <div className="lx-actions">
      <PrimaryCta plan={PLAN.slug} className="lx-btn-block" source="preview4" landingPath="/preview4" onPay={pay}>
        Start the 84 days · {PLAN.displayPrice}
      </PrimaryCta>
      <Link href={TALK_HREF} className="lx-btn lx-btn-call" onClick={() => trackFunnelStep('talk_to_coach', { source: 'preview4', path: '/preview4' })}>
        Talk to a coach
      </Link>
    </div>
  )
}

const NAV = [
  ['/preview4/program', 'The 84 days'],
  ['/preview4/coaches', 'Coaches'],
  ['/preview4/how-it-works', 'How it works'],
  ['/preview4/faq', 'Questions'],
  [TALK_HREF, 'Talk to a coach'],
] as const

function BeigeNav() {
  return (
    <header className="lx-header">
      <div className="lx-nav">
        <nav className="lx-nav-links" aria-label="Page">
          {NAV.slice(0, 4).map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <details className="lx-menu">
          <summary>Menu</summary>
          <div className="lx-menu-list">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </div>
        </details>
        <Link href="/preview4" className="lx-logo">LURVOX</Link>
        <div className="lx-nav-actions">
          <Link href="/login" className="lx-login">Client login</Link>
        </div>
      </div>
    </header>
  )
}

function BeigeSticky() {
  const pay = usePay()
  return (
    <div className="lx-sticky">
      <PrimaryCta plan={PLAN.slug} className="lx-btn-block" source="preview4" landingPath="/preview4" onPay={pay}>
        Start · {PLAN.displayPrice}
      </PrimaryCta>
      <Link href={TALK_HREF} className="lx-sticky-talk" onClick={() => trackFunnelStep('talk_to_coach', { source: 'preview4', path: '/preview4' })}>
        Talk to a coach
      </Link>
    </div>
  )
}

function BeigeFooter() {
  return (
    <footer className="lx-footer">
      <strong>LURVOX</strong>
      <p>84-day transformation. {PLAN.displayPrice} once.</p>
      <p>14, Sector 44, Golf Course Road, Gurugram, Haryana 122003</p>
      <p><a href="mailto:hello@lurvox.in">hello@lurvox.in</a></p>
      <p>
        <Link href="/preview4/program">The 84 days</Link>
        <Link href={TALK_HREF}>Talk to a coach</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/refund-policy">Refund policy</Link>
        <Link href="/login">Log in</Link>
      </p>
      <p>Secure payments via Razorpay. Results vary.</p>
    </footer>
  )
}

export function BeigeHome() {
  useEffect(() => {
    const pricing = document.getElementById('pricing')
    const heroCta = document.querySelector('.lx-hero .lx-actions')
    const bar = document.querySelector('.lx-sticky')
    if (!pricing || !heroCta || !bar) return
    const seen = { hero: true, pricing: false }
    const sync = () => bar.classList.toggle('is-hidden', seen.hero || seen.pricing)
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === heroCta) seen.hero = entry.isIntersecting
        if (entry.target === pricing) seen.pricing = entry.isIntersecting
      }
      sync()
    }, { threshold: 0.35 })
    observer.observe(heroCta)
    observer.observe(pricing)
    sync()
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <section className="lx-hero" id="top">
        <div className="lx-hero-copy">
          <p className="lx-eyebrow">One plan</p>
          <h1>
            <span>84 days.</span>
            <span>One transformation.</span>
          </h1>
          <p className="lx-lead">
            A personal workout, a personal diet, and a coach in the app. No second plan to choose.
          </p>
          <div className="lx-hero-photo">
            <CampaignImage
              src="/images/lurvox/campaign/hero-muscle.webp"
              alt="Man in a heavy squat in a private studio"
              priority
              className="lx-cover"
            />
          </div>
          <p className="lx-price">
            <strong>{PLAN.displayPrice}</strong>
            <em>for 84 days · once</em>
          </p>
          <OfferActions />
        </div>
      </section>

      <section className="lx-fail" id="why">
        <p className="lx-eyebrow">Why one block</p>
        <h2>Long enough to change. Short enough to finish.</h2>
        <p className="lx-lead">84 days is twelve weeks. The work is decided for you. You are not picking a length.</p>
        <ul className="lx-include">
          <li>One price. {PLAN.displayPrice}. Paid once.</li>
          <li>The plan is written for your food, your week, and where you train.</li>
          <li>Check-ins twice a week. The plan moves with you.</li>
          <li>A coach calls you first if you would rather talk than pay today.</li>
        </ul>
      </section>

      <section className="lx-system" id="system">
        <p className="lx-eyebrow">Included</p>
        <h2>What you get for {PLAN.displayPrice}.</h2>
        <ul className="lx-include">
          {INCLUDED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="lx-coaches" id="coaching">
        <div className="lx-coaches-copy">
          <p className="lx-eyebrow">Coaches</p>
          <h2>Two coaches. Your case has a person.</h2>
          <p className="lx-lead">Piyush Aggarwal and Rakshit Mohla. You can open their Instagram, or ask for a call before you start.</p>
        </div>
        <div className="lx-coach-row">
          {coaches.map((coach) => (
            <a key={coach.instagramHandle} href={coach.instagramUrl} target="_blank" rel="noopener noreferrer">
              <img src={coach.photo} alt={`${coach.name}, LURVOX coach`} />
              <span>
                <strong>{coach.name}</strong>
                <em>{coach.instagramHandle}</em>
              </span>
            </a>
          ))}
        </div>
        <OfferActions />
      </section>

      <section className="lx-method" id="method">
        <p className="lx-eyebrow">The 84 days</p>
        <h2>Four blocks. One plan.</h2>
        <ol>
          {PHASES.map((phase) => (
            <li key={phase.n}>
              <span>{phase.days}</span>
              <strong>{phase.title}</strong>
              <p>{phase.body}</p>
            </li>
          ))}
        </ol>
        <p className="lx-lead"><Link href="/preview4/program">Read the full 84 days</Link></p>
      </section>

      <section className="lx-pricing" id="pricing">
        <p className="lx-eyebrow">The offer</p>
        <h2>84-day transformation.</h2>
        <div className="lx-plans">
          <article className="is-popular">
            <p className="lx-kicker"><span className="lx-length">84 days</span></p>
            <h3>Complete coaching block</h3>
            <p className="lx-plan-price">
              {PLAN.displayPrice}
              <em>once · not a subscription</em>
            </p>
            <ul className="lx-points">
              {INCLUDED.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <OfferActions />
          </article>
        </div>
      </section>

      <FaqList id="faq" />

      <section className="lx-final" id="close">
        <div className="lx-final-copy">
          <h2>Start the 84 days, or talk first.</h2>
          <p className="lx-price">
            <strong>{PLAN.displayPrice}</strong>
            <em>once</em>
          </p>
          <OfferActions />
        </div>
      </section>
    </>
  )
}

export function ProgramPage() {
  return (
    <section className="lx-system" id="system">
      <p className="lx-eyebrow">The 84 days</p>
      <h2>What the twelve weeks are for.</h2>
      <p className="lx-lead">One plan. Four blocks. The coach reviews the check-ins and the plan moves.</p>
      <ol className="lx-phases">
        {PHASES.map((phase) => (
          <li key={phase.n}>
            <span>{phase.n} · {phase.days}</span>
            <strong>{phase.title}</strong>
            <p>{phase.body}</p>
          </li>
        ))}
      </ol>
      <h2>Included the whole way</h2>
      <ul className="lx-include">
        {INCLUDED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <OfferActions />
    </section>
  )
}

export function CoachesPage() {
  return (
    <section className="lx-coaches" id="coaching">
      <div className="lx-coaches-copy">
        <p className="lx-eyebrow">Coaches</p>
        <h2>Talk to them, or start.</h2>
        <p className="lx-lead">A free call is a name and a WhatsApp number. Paying starts the 84 days.</p>
      </div>
      <div className="lx-coach-row">
        {coaches.map((coach) => (
          <a key={coach.instagramHandle} href={coach.instagramUrl} target="_blank" rel="noopener noreferrer">
            <img src={coach.photo} alt={`${coach.name}, LURVOX coach`} />
            <span>
              <strong>{coach.name}</strong>
              <em>{coach.instagramHandle}</em>
            </span>
          </a>
        ))}
      </div>
      <OfferActions />
    </section>
  )
}

const STEPS = [
  { n: '01', title: 'Pay, or book a call.', body: `Pay ${PLAN.displayPrice} to start the 84 days. Or leave your number and a coach calls you first.` },
  { n: '02', title: 'Tell us the case.', body: 'Onboarding covers your goal, food, schedule, and photos. The plan is written from that.' },
  { n: '03', title: 'Do the work.', body: 'Train, eat, and log it. Your coach sees the trackers.' },
  { n: '04', title: 'The plan moves.', body: 'Mid-week and weekly check-ins. Updates every week for the rest of the 84 days.' },
] as const

export function HowPage() {
  return (
    <section className="lx-method" id="method">
      <p className="lx-eyebrow">How it works</p>
      <h2>From the first click to day 84.</h2>
      <ol>
        {STEPS.map((step) => (
          <li key={step.n}>
            <span>{step.n}</span>
            <strong>{step.title}</strong>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
      <OfferActions />
    </section>
  )
}

export function FaqPage() {
  return <FaqList />
}

function FaqList({ id = 'faq' }: { id?: string }) {
  return (
    <section className="lx-faq" id={id}>
      <h2>Questions</h2>
      {FAQ.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
      <p className="lx-note">
        <Link href="/terms#payments-refunds-guarantees">Read the Terms</Link>
      </p>
    </section>
  )
}

export function TalkPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState(false)

  useEffect(() => {
    try {
      setBooked(window.localStorage.getItem(CALL_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    persistMetaClickIdsFromLocation()
    trackFunnelStep('talk_to_coach', { source: 'preview4', path: '/preview4/talk' })
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
        window.localStorage.setItem(CALL_KEY, '1')
      } catch {
        /* ignore */
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  return (
    <section className="lx-talk" id="talk">
      <p className="lx-eyebrow">Free coach call</p>
      {booked ? (
        <>
          <h2>Call booked.</h2>
          <p className="lx-lead">A coach will call you. The 84 days start only if you pay {PLAN.displayPrice}.</p>
        </>
      ) : (
        <>
          <h2>Talk to a coach.</h2>
          <p className="lx-lead">Name and WhatsApp. About 20 seconds. No payment.</p>
          <form onSubmit={submit}>
            <label>
              Name
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />
            </label>
            <label>
              WhatsApp number
              <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required />
            </label>
            {error ? <p className="lx-talk-error">{error}</p> : null}
            <button type="submit" className="lx-btn lx-btn-primary lx-btn-block" disabled={loading}>
              {loading ? 'Sending…' : 'Request a free call'}
            </button>
            <p className="lx-lead">Free. A coach typically calls within a few hours.</p>
          </form>
        </>
      )}
    </section>
  )
}
