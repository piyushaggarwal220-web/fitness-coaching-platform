'use client'

import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PreviewAdCapture } from '@/components/studio/PreviewAdCapture'
import { PREVIEW4_AD_PATH, PREVIEW4_DROPOFF_SECTIONS } from '@/lib/analytics/ad-landing'
import { trackFunnelStep } from '@/lib/analytics/funnel'
import { persistMetaClickIdsFromLocation } from '@/lib/analytics/meta-attribution'
import { coaches } from '@/lib/content'
import { TRANSFORMATION_PLANS } from '@/lib/payments/plans'
import { DirectCheckout } from './DirectCheckout'
import { PreviewSaleProvider } from './PreviewSaleCode'
import { OfferChat } from './offer-chat'
import { CampaignImage, PrimaryCta } from './primitives'

const PLAN_ARRIVES = '24 hours'
const PLAN = TRANSFORMATION_PLANS.offer_84_days
const TALK_HREF = '/preview4/talk'
const NEXT_HREF = '/preview4/next'
const CALL_KEY = 'lurvox_preview4_call_booked'
const CALL_MESSAGE = 'Please call me about the 84-day transformation.'

const PayContext = createContext<(plan: string) => void>(() => {})

const INCLUDED = [
  { label: 'Personal workout plan', src: '/images/lurvox/beige/sm/included-workout.webp', alt: 'A silver dumbbell on cream linen' },
  { label: 'Personal diet plan', src: '/images/lurvox/beige/sm/included-diet.webp', alt: 'A plated meal on a beige table' },
  { label: 'Cardio and supplement plans', src: '/images/lurvox/beige/sm/included-guidance.webp', alt: 'A silver running shoe and a glass bottle' },
  { label: 'A human coach in the app', src: '/images/lurvox/beige/sm/included-coach.webp', alt: 'Hands holding a phone in a quiet room' },
  { label: 'Mid-week and weekly check\u2011ins', src: '/images/lurvox/beige/sm/included-checkin.webp', alt: 'An open notebook and a silver pen' },
  { label: 'Workout and diet trackers', src: '/images/lurvox/beige/sm/included-trackers.webp', alt: 'A small card beside a dumbbell and herbs' },
  { label: 'Plan updates every week', src: '/images/lurvox/beige/sm/included-updates.webp', alt: 'A hand turning a cream card in a stack' },
] as const

const FAQ = [
  ['What is this?', 'One block of online coaching. 84 days. One price. A workout plan, a diet plan, check-ins, and a coach in the app.'],
  ['What do I pay?', `${PLAN.displayPrice} once, for 84 days. It is not a monthly charge.`],
  ['When does the plan arrive?', `After onboarding and the required photos, the first plan arrives within ${PLAN_ARRIVES}.`],
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
        <OfferChat />
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
  return (
    <div className="lx-actions" data-lx-buy>
      <Link href={NEXT_HREF} className="lx-btn lx-btn-primary lx-btn-block">
        See how it runs · {PLAN.displayPrice}
      </Link>
      <Link href={TALK_HREF} className="lx-btn lx-btn-call" onClick={() => trackFunnelStep('talk_to_coach', { source: 'preview4', path: '/preview4' })}>
        Talk to a coach
      </Link>
    </div>
  )
}

const NAV = [
  ['/preview4#system', 'Included'],
  ['/preview4#coaching', 'Coaches'],
  [NEXT_HREF, 'How it runs'],
  ['/preview4#faq', 'Questions'],
  [TALK_HREF, 'Talk to a coach'],
] as const

function BeigeNav() {
  const path = usePathname()
  const onHome = path === '/preview4'
  const onNext = path === NEXT_HREF
  const pay = usePay()
  return (
    <header className="lx-header">
      <div className="lx-nav">
        <div className="lx-nav-start">
          {onHome ? null : (
            <Link href="/preview4" className="lx-home" aria-label="Back to home">
              <span className="lx-home-mark" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M9.5 3.5 5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="lx-home-label">Home</span>
            </Link>
          )}
          <nav className="lx-nav-links" aria-label="Page">
            {NAV.slice(0, 4).map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </nav>
          <details className="lx-menu">
            <summary>Menu</summary>
            <div className="lx-menu-list">
              {onHome ? null : <Link href="/preview4">Home</Link>}
              {NAV.map(([href, label]) => (
                <Link key={href} href={href}>{label}</Link>
              ))}
              {onNext ? <Link href="/login">Client login</Link> : null}
            </div>
          </details>
        </div>
        <Link href="/preview4" className="lx-logo">LURVOX</Link>
        <div className="lx-nav-actions">
          {onNext ? (
            <PrimaryCta plan={PLAN.slug} className="lx-nav-cta" source="preview4" landingPath="/preview4" onPay={pay}>
              Start · {PLAN.displayPrice}
            </PrimaryCta>
          ) : null}
          <Link href="/login" className="lx-login">Client login</Link>
        </div>
      </div>
    </header>
  )
}

function BeigeFooter() {
  if (usePathname() !== '/preview4') return null
  return (
    <footer className="lx-footer">
      <strong>LURVOX</strong>
      <p>84-day transformation. {PLAN.displayPrice} once.</p>
      <p>14, Sector 44, Golf Course Road, Gurugram, Haryana 122003</p>
      <p><a href="mailto:hello@lurvox.in">hello@lurvox.in</a></p>
      <p>
        <Link href={NEXT_HREF}>How it runs</Link>
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
  return (
    <>
      <section className="lx-hero" id="top">
        <div className="lx-hero-copy">
          <p className="lx-eyebrow">84 days</p>
          <h1>
            <span>Complete</span>
            <span>transformation.</span>
          </h1>
          <p className="lx-lead">
            You choose a starting point: lose fat, skinny-fat, or gain weight. Workout and diet are written for that body. Check in twice a week.
          </p>
          <p className="lx-price">
            <strong>{PLAN.displayPrice}</strong>
            <em>for 84 days · once</em>
          </p>
          <p className="lx-arrive">First plan within {PLAN_ARRIVES}, after onboarding and photos.</p>
          <div className="lx-actions">
            <Link href={NEXT_HREF} className="lx-btn lx-btn-primary lx-btn-block">
              Click here to start
            </Link>
            <Link href={TALK_HREF} className="lx-btn lx-btn-call" onClick={() => trackFunnelStep('talk_to_coach', { source: 'preview4', path: '/preview4' })}>
              Talk to a coach
            </Link>
          </div>
          <div className="lx-hero-photo">
            <CampaignImage
              src="/images/lurvox/campaign/hero-muscle.webp"
              alt="Man in a heavy squat in a private studio"
              priority
              className="lx-cover"
            />
          </div>
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
        <ul className="lx-gifts">
          {INCLUDED.map((item) => (
            <li key={item.label}>
              <figure>
                <CampaignImage src={item.src} alt={item.alt} />
              </figure>
              <strong>{item.label}</strong>
            </li>
          ))}
        </ul>
        <p className="lx-shared">Men get a testosterone protocol. Women get hourglass guidance.</p>
      </section>

      <section className="lx-coaches" id="coaching">
        <div className="lx-coaches-copy">
          <p className="lx-eyebrow">Coaches</p>
          <h2>Your coach. Your case has a person.</h2>
          <p className="lx-lead">Piyush Aggarwal. You can open his Instagram, or ask for a call before you start.</p>
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
      </section>

      <section className="lx-method" id="method">
        <p className="lx-eyebrow">The 84 days</p>
        <h2>One week, twelve times.</h2>
        <p className="lx-lead">The steps after you pay are on the next page.</p>
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
            <p className="lx-arrive">First plan within {PLAN_ARRIVES}, after onboarding and photos.</p>
            <p className="lx-offer-line">Workout, diet, cardio, and supplements. A new plan every week.</p>
            <p className="lx-offer-more"><a href="#system">See everything included</a></p>
            <OfferActions />
          </article>
        </div>
      </section>

      <FaqList id="faq" />

      <section className="lx-final" id="close">
        <div className="lx-final-copy">
          <h2>See how it runs, or talk first.</h2>
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

const AFTER_PAY = [
  { n: '01', title: 'One payment.', body: `${PLAN.displayPrice} for the full 84 days. Not a subscription.` },
  { n: '02', title: 'Your starting point.', body: 'Lose fat, skinny-fat, or gain weight. Then training, food, and photos.' },
  { n: '03', title: 'Your first plan.', body: `Workout, diet, cardio, and supplements, within ${PLAN_ARRIVES} of onboarding and photos.` },
  { n: '04', title: 'Two check-ins.', body: 'Wednesday brings a reply. The plan stays. Sunday writes the next one from your week.' },
  { n: '05', title: 'Your coach.', body: 'In the app with you for the full 84 days.' },
] as const

export function BeforePayPage() {
  const pay = usePay()
  useEffect(() => {
    const key = 'lx_preview4_before_view'
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* still record the view */
    }
    trackFunnelStep('view_landing', {
      source: 'preview4',
      path: '/preview4/next',
      screen: 'before_pay',
      plan: PLAN.slug,
      plan_name: PLAN.name,
      value: PLAN.amountPaise / 100,
      currency: 'INR',
    })
  }, [])
  return (
    <section className="lx-brief">
      <div className="lx-brief-side">
        <div className="lx-brief-copy">
          <p className="lx-eyebrow">After you pay</p>
          <h1>How the 84 days run.</h1>
          <p className="lx-lead">The plan is written from you, then rewritten every week.</p>
        </div>
        <div className="lx-brief-pay" data-lx-buy>
          <p className="lx-price">
            <strong>{PLAN.displayPrice}</strong>
            <em>once · 84 days</em>
          </p>
          <p className="lx-brief-note">Paid once. Not a monthly charge.</p>
          <div className="lx-actions">
            <PrimaryCta plan={PLAN.slug} className="lx-btn-block" source="preview4" landingPath="/preview4" onPay={pay}>
              Start your transformation
            </PrimaryCta>
          </div>
        </div>
      </div>
      <ol>
        {AFTER_PAY.map((step) => (
          <li key={step.n}>
            <span>{step.n}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
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
