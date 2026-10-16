'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { CheckoutFunnelLink } from '@/components/analytics/CheckoutFunnelLink'
import { AnimatedTransformations } from '@/components/landing/AnimatedTransformations'
import { InstantFitnessQuiz } from '@/components/landing/InstantFitnessQuiz'
import { PreviewAdCapture } from '@/components/studio/PreviewAdCapture'
import type { CoachResult } from '@/components/landing/OfferLanding'
import { PREVIEW3_AD_PATH, PREVIEW3_DROPOFF_SECTIONS } from '@/lib/analytics/ad-landing'
import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'

const LANDING = PREVIEW3_AD_PATH

const PORTRAIT: Record<CoachResult['key'], string> = {
  piyush: '/landing/instant-coach-piyush.png',
  rakshit: '/landing/instant-coach-rakshit.png',
}

type PlanCard = {
  slug: CoachingPlanSlug
  chip: string
  length: string
  monthly: string
  tone: 'fat' | 'mid' | 'athletic'
  tag?: string
  note?: string
  points: string[]
  extras?: { label: string; items: string[] }
  cta: string
}

const PLANS: PlanCard[] = [
  {
    slug: '3_months',
    chip: 'Fat loss · 3 months',
    length: '90 days',
    monthly: '3 months · ≈ ₹200/mo',
    tone: 'fat',
    points: [
      'Check-in mid-week and every week',
      'Plan rewritten every 14 days',
      'Trackers unlocked',
      'Coach chat unlocked',
      'Journey unlocked',
      'Progress photos',
    ],
    cta: 'Get Fat loss',
  },
  {
    slug: '6_months',
    chip: 'Fat loss + muscle · 6 months',
    length: '6 months',
    monthly: '≈ ₹167/mo',
    tone: 'mid',
    tag: 'Most popular',
    note: 'Fat loss plus muscle, rewritten every week for 6 months.',
    points: [
      'Check-in mid-week and every week',
      'Plan rewritten after each weekly check-in',
      'Trackers, coach chat, Journey unlocked',
      'Progress photos',
      'Fat loss and muscle in one plan',
      'Longer runway to keep results',
    ],
    extras: {
      label: 'At no extra cost',
      items: ['Muscle programming', 'Weekly plan updates'],
    },
    cta: 'Get Fat loss + muscle',
  },
  {
    slug: '12_months',
    chip: 'Athletic body · 12 months',
    length: '12 months',
    monthly: '≈ ₹142/mo · lowest monthly cost',
    tone: 'athletic',
    tag: 'Best value',
    note: 'Full year of coaching. Fat loss, muscle, and stamina in one plan.',
    points: [
      'Check-in mid-week and every week, all year',
      'Plan rewritten after each weekly check-in',
      'Trackers, coach chat, Journey unlocked',
      'Progress photos + plan tweaks',
      'Fat loss, muscle, and stamina',
      'Longest runway to keep results',
    ],
    extras: {
      label: '12-month athletic runway',
      items: ['Stamina programming', 'Lowest ₹/month'],
    },
    cta: 'Get Athletic body',
  },
]

const FAIL = [
  'Generic AI plans copy the same template for everyone',
  'Old beliefs like “more sweat means more fat loss”',
  'Random YouTube workouts with no weekly structure',
  'Crash diets that crash your energy and adherence',
  'Ignoring sleep, water, and recovery',
  'Changing plans every week before results can show',
]

const WIN = [
  'Fat loss is rewritten every 14 days. The 6- and 12-month plans are rewritten every week',
  'Trackers, coach chat, and Journey unlocked from day one',
  'Science first: calories, protein, progressive overload, recovery',
  'Mid-week and weekly check-ins on every plan. A new plan every 14 days on Fat loss, every week on the longer plans',
  'Daily trackers so we can see what is actually happening',
  'Built for your schedule, gym or home, veg or mixed diet',
]

const FAQ = [
  {
    q: 'What happens after I pay?',
    a: 'Razorpay confirms the payment. We email you the next steps with a secure account link. Create your login, finish a short assessment with progress photos, then your personal workout and diet lands in the app — usually within a few hours, always inside 48 hours. After that you use daily trackers, weekly check-ins, and coach chat.',
  },
  {
    q: 'How do you make sure I get what I paid for?',
    a: 'Your purchase is recorded against your email. If onboarding is complete and we do not deliver your first plan within 48 hours, you get a full refund if you request it within 7 days. The plan sits in the app under My Plan, and we email you when it is ready.',
  },
  {
    q: 'What exactly is included?',
    a: 'Check-ins are mid-week and weekly on every plan. Fat loss is rewritten every 14 days. The 6- and 12-month plans are rewritten after each weekly check-in. Daily trackers, coach chat, and Journey are included. No weekly phone calls — support is inside the app.',
  },
  {
    q: 'Is this real 1-to-1 coaching?',
    a: 'Yes. Your plan, check-ins, and progress are handled as your case — with personalised updates and chat support inside the app.',
  },
  {
    q: 'Gym or home? Beginners? Vegetarians?',
    a: 'All welcome. Plans are built for gym, home, or mixed setups, matched to your experience level, and diet is customised for vegetarian, vegan, and allergy needs.',
  },
  {
    q: 'What if I want a refund?',
    a: 'Full refund if onboarding is complete and we do not deliver your first plan within 48 hours, requested within 7 days of purchase. After plan delivery, purchases are generally non-refundable. Details are in the Terms.',
  },
]

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
      source="preview3"
      landingPath={LANDING}
      className={className}
    >
      {children}
    </CheckoutFunnelLink>
  )
}

function Stamp() {
  return (
    <div className="lx3-stamp" aria-label="Guaranteed results, moneyback if none">
      <span>
        <b>Guaranteed</b>
        <strong>Results</strong>
        <b>Moneyback</b>
      </span>
    </div>
  )
}

export function ColourLanding({ coaches }: { coaches: CoachResult[] }) {
  const [sticky, setSticky] = useState(false)
  const athletic = PLANS[2]

  useEffect(() => {
    const onScroll = () => {
      const plans = document.getElementById('plans')
      const footer = document.getElementById('close')
      let show = window.scrollY > 420
      if (plans) {
        const box = plans.getBoundingClientRect()
        if (box.top < window.innerHeight * 0.2 && box.bottom > 80) show = true
      }
      if (footer && footer.getBoundingClientRect().top < window.innerHeight - 40) show = false
      setSticky(show)
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
    <div className="lx3">
      <PreviewAdCapture
        path={LANDING}
        sections={PREVIEW3_DROPOFF_SECTIONS}
        funnelSource="preview3"
        viewKey="lx_preview3_view"
      />

      <section className="lx3-hero" id="top" aria-labelledby="lx3-title">
        <Link className="lx3-login" href="/login">
          Existing client log in
        </Link>
        <div className="lx3-hero-grid">
          <div>
            <h1 id="lx3-title">
              Personalised fitness plans, <span>within 48 hours.</span>
            </h1>
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
            <p className="lx3-lede">
              Coach-made workout and diet around your goals, from ₹599. Check-ins are mid-week and weekly. <strong>Fat loss is rewritten every 14 days.</strong> The 6- and 12-month plans are rewritten every week.
            </p>
            <ul className="lx3-trust">
              <li>Fat loss updates every 14 days</li>
              <li>6 and 12 months update every week</li>
              <li>Beginner friendly</li>
            </ul>
          </div>

          <div>
            <div className="lx3-portraits">
              {coaches.map((coach) => (
                <figure key={coach.key} className="lx3-portrait">
                  <a
                    className="lx3-photo"
                    href={coach.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${coach.name} on Instagram ${coach.handle}`}
                  >
                    <img src={PORTRAIT[coach.key]} alt={`${coach.name}, LURVOX coach`} width={400} height={533} />
                  </a>
                  <figcaption>
                    <strong>{coach.name.split(' ')[0]}</strong>
                    <a href={coach.href} target="_blank" rel="noopener noreferrer">
                      {coach.handle}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="lx3-hint">Tap a photo to open Instagram</p>
            <div className="lx3-people">
              <p>Transformed over 7000 people</p>
              <span>First plan within 48 hours, or a refund within 7 days</span>
            </div>
          </div>
        </div>
        <div className="lx3-stamp-row">
          <Stamp />
        </div>
      </section>

      <section className="lx3-plans" id="plans" aria-labelledby="lx3-plans-title">
        <p className="lx3-eyebrow">Choose your plan</p>
        <h2 id="lx3-plans-title">Simple plans. Real coaching.</h2>
        <p className="lx3-plans-lede">
          Check-ins are mid-week and weekly on every plan. <strong>Fat loss</strong> is rewritten every 14 days. The 6- and 12-month plans are rewritten every week.
        </p>
        <div className="lx3-stack">
          {PLANS.map((plan) => (
            <article key={plan.slug} className={`lx3-card lx3-card-${plan.tone}`}>
              {plan.tag ? <p className={`lx3-tag${plan.tone === 'athletic' ? ' lx3-tag-best' : ''}`}>{plan.tag}</p> : null}
              <span className="lx3-dur">{plan.length}</span>
              <h3>{plan.tone === 'mid' ? 'Fat loss + muscle' : COACHING_PLANS[plan.slug].name}</h3>
              <p className="lx3-price">{COACHING_PLANS[plan.slug].displayPrice}</p>
              <p className="lx3-meta">{plan.monthly}</p>
              {plan.note ? <p className={`lx3-note${plan.tone === 'athletic' ? ' lx3-note-gold' : ''}`}>{plan.note}</p> : null}
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
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
                {plan.cta}
              </PlanLink>
            </article>
          ))}
        </div>
      </section>

      <section className="lx3-truth" id="truth" aria-labelledby="lx3-truth-title">
        <p className="lx3-eyebrow lx3-eyebrow-orange">Truth check</p>
        <h2 id="lx3-truth-title">Why we give results, but you fail</h2>
        <p className="lx3-plans-lede">
          Most people fail on generic templates and gym myths. We build customised plans on science and coach principles.
        </p>
        <div className="lx3-truth-grid">
          <article className="lx3-truth-fail">
            <p>Why people fail</p>
            <ul>
              {FAIL.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="lx3-truth-win">
            <p>Why our plans work</p>
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
              <strong>Create your account</strong>
              <p>We email the next steps. Finish the short assessment and photos in the app.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Receive your plan</strong>
              <p>First workout and diet in 24–48 hours. Check-ins are mid-week and weekly. Fat loss is rewritten every 14 days. The 6- and 12-month plans are rewritten every week. If the first plan does not arrive, you get a refund.</p>
            </div>
          </li>
        </ol>
      </section>

      <div id="changes">
        <AnimatedTransformations
          eyebrow="Expected changes"
          heading="Within 30 days of consistent work"
          lede="Skinny to bulky. Fat to shredded. Soft to toned. Men and women."
        />
      </div>

      <div id="quiz" className="lx3-quiz">
        <InstantFitnessQuiz offer="coaching" />
      </div>

      <section className="lx3-faq" id="faq" aria-labelledby="lx3-faq-title">
        <p className="lx3-eyebrow lx3-eyebrow-orange">FAQ</p>
        <h2 id="lx3-faq-title">Questions before you start</h2>
        <p className="lx3-plans-lede">Straight answers on coaching, what is included, and how the system works — before you pick a plan.</p>
        <div className="lx3-faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>
                {item.a}{' '}
                {item.q === 'What if I want a refund?' ? (
                  <Link href="/terms#payments-refunds-guarantees">Terms</Link>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="lx3-close" id="close" aria-label="Choose your plan and start">
        <p className="lx3-eyebrow lx3-eyebrow-orange">Ready to start</p>
        <h2>Start with your goal. We build everything around it.</h2>
        <p>
          Goal first. Time is the runway. <strong>Fat loss</strong> is 90 days · <strong>₹599</strong>, rewritten every 14 days. <strong>Fat loss + muscle gain</strong> is 6 months · <strong>₹999</strong>, rewritten every week. <strong>Athletic body</strong> is 12 months · <strong>₹1,699</strong> — fat loss, muscle, and stamina, rewritten every week. Check-ins are mid-week and weekly on every plan.
        </p>
        <a className="lx3-jump" href="#plans">
          See plans — ₹599 · ₹999 · ₹1,699
        </a>
        <div className="lx3-stamp-row">
          <Stamp />
        </div>
        <p className="lx3-stamp-note">Guaranteed results · moneyback if none</p>
        <div className="lx3-badges" aria-label="Secure checkout">
          <span>Razorpay Secure</span>
          <span>UPI</span>
          <span>Cards</span>
          <span>Netbanking</span>
        </div>
        <div className="lx3-close-actions">
          {PLANS.map((plan) => (
            <PlanLink key={plan.slug} plan={plan} className={`lx3-close-btn lx3-close-${plan.tone}`}>
              {plan.tone === 'mid' ? 'Fat loss + muscle' : COACHING_PLANS[plan.slug].name} · {COACHING_PLANS[plan.slug].displayPrice}
            </PlanLink>
          ))}
        </div>
        <p className="lx3-terms">
          Service rules, refunds, and any guarantees are only in the <Link href="/terms#payments-refunds-guarantees">Terms</Link>.
        </p>
        <p className="lx3-alt">
          Still deciding? <a href="#quiz">Take the fitness quiz</a>
        </p>
      </section>

      <div className={`lx3-sticky${sticky ? ' is-on' : ''}`}>
        <div>
          <strong>Athletic body</strong>
          <span>12 months · ₹1,699 · lowest monthly cost</span>
        </div>
        <PlanLink plan={athletic} className="lx3-sticky-cta">
          Get Athletic body
        </PlanLink>
      </div>
    </div>
  )
}
