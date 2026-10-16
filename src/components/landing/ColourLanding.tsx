'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { CheckoutFunnelLink } from '@/components/analytics/CheckoutFunnelLink'
import { PreviewAdCapture } from '@/components/studio/PreviewAdCapture'
import type { CoachResult } from '@/components/landing/OfferLanding'
import { PREVIEW3_AD_PATH, PREVIEW3_DROPOFF_SECTIONS } from '@/lib/analytics/ad-landing'
import { FIRST_PLAN_TARGET } from '@/lib/payments/plan-pages'
import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'

const LANDING = PREVIEW3_AD_PATH

type PlanCard = {
  slug: CoachingPlanSlug
  chip: string
  length: string
  monthly: string
  tone: 'fat' | 'mid' | 'athletic'
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
    monthly: '₹200 a month',
    tone: 'fat',
    points: [
      'Workout for your level, at a gym or at home',
      'Diet built around the food you already eat',
      'Check-in mid-week and every week',
      'Coach chat in the app when you are stuck',
      'Plan rewritten every 14 days',
    ],
    cta: 'Get Fat loss',
  },
  {
    slug: '6_months',
    chip: 'Fat loss + muscle gain · 6 months',
    length: '6 months',
    monthly: '₹167 a month',
    tone: 'mid',
    note: 'Everything in Fat loss, for 6 months, with muscle programmed in.',
    points: [
      'Workout and diet, rewritten every week',
      'A cardio plan on top of the training',
      'A supplement plan',
      'Extra help if progress stalls after 90 days',
      'Check-ins and coach chat the whole way',
    ],
    extras: {
      label: 'On this plan',
      items: ['Cardio', 'Supplement guidance', 'Weekly plan updates'],
    },
    cta: 'Get Fat loss + muscle gain',
  },
  {
    slug: '12_months',
    chip: 'Athletic body · 12 months',
    length: '12 months',
    monthly: '₹142 a month',
    tone: 'athletic',
    note: 'A full year. Fat loss, muscle, and stamina.',
    points: [
      'Everything included in fat loss + muscle gain',
      'Stamina work',
      'Updated every week',
    ],
    extras: {
      label: 'Lowest monthly price',
      items: ['Stamina work', 'Weekly plan updates', '₹142 a month, paid once'],
    },
    cta: 'Get Athletic body',
  },
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
    a: 'Fat loss is ₹599 for 90 days, under ₹7 a day. Fat loss and muscle gain is ₹999 for 6 months, under ₹6 a day. The athletic plan is ₹1,699 for the year, under ₹5 a day. Each price is paid once.',
  },
  {
    q: 'Is the plan personalised?',
    a: 'Yes. After payment you answer the questions and send photos. Your coach writes the plan for your body, your goal, and your day. It is not a copied template.',
  },
  {
    q: 'Why are the rates this low?',
    a: 'This is online coaching in the app: a plan written for you, check-ins, and coach chat. It is not a trainer standing with you in person every session. That is why it starts at ₹599.',
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

export function ColourLanding({ coaches }: { coaches: CoachResult[] }) {
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
              Personalised fitness plans, <span>within 1–2 hours.</span>
            </h1>
            <div className="lx3-offers" aria-label="Choose a plan">
              {PLANS.map((plan) => (
                <PlanLink key={plan.slug} plan={plan} className={`lx3-offer lx3-offer-${plan.tone}`}>
                  <span>{plan.chip}</span>
                  <strong>{COACHING_PLANS[plan.slug].displayPrice}</strong>
                </PlanLink>
              ))}
            </div>
            <p className="lx3-lede">
              {FIRST_PLAN_TARGET} Coach-made workout and diet from ₹599, paid once. Fat loss is rewritten every 14 days. The 6- and 12-month plans are rewritten every week, and they include cardio and supplement guidance.
            </p>
            <ul className="lx3-trust">
              <li>Gym, home, or both</li>
              <li>Diet around your food</li>
              <li>Check-ins in the app</li>
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
                    <img src={coach.portrait} alt={`${coach.name}, LURVOX coach`} width={400} height={533} />
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
            <p className="lx3-pill">First plan within 1–2 hours after onboarding</p>
          </div>
        </div>
      </section>

      <section className="lx3-plans" id="plans" aria-labelledby="lx3-plans-title">
        <p className="lx3-eyebrow">Choose your plan</p>
        <h2 id="lx3-plans-title">Simple plans. Real coaching.</h2>
        <p className="lx3-plans-lede">
          Paid once. Fat loss is rewritten every 14 days. The longer plans are rewritten every week.
        </p>
        <div className="lx3-stack">
          {PLANS.map((plan) => (
            <article key={plan.slug} className={`lx3-card lx3-card-${plan.tone}`}>
              <span className="lx3-dur">{plan.length}</span>
              <h3>{COACHING_PLANS[plan.slug].name}</h3>
              <p className="lx3-price">{COACHING_PLANS[plan.slug].displayPrice}</p>
              <p className="lx3-meta">
                {plan.monthly} · paid once
              </p>
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

      <section className="lx3-steps" id="steps" aria-labelledby="lx3-steps-title">
        <p className="lx3-eyebrow lx3-eyebrow-orange">How it works</p>
        <h2 id="lx3-steps-title">Your plan in 3 steps</h2>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Pay once</strong>
              <p>Checkout with Razorpay. UPI, cards, or netbanking.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Create your account</strong>
              <p>Finish the onboarding form and send front, side, and back photos. Photos are required unless the form marks them optional.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Receive your plan</strong>
              <p>
                {FIRST_PLAN_TARGET} Fat loss is rewritten every 14 days. The 6- and 12-month plans are rewritten every week.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="lx3-faq" id="faq" aria-labelledby="lx3-faq-title">
        <p className="lx3-eyebrow lx3-eyebrow-orange">FAQ</p>
        <h2 id="lx3-faq-title">Questions before you start</h2>
        <div className="lx3-faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>
                {item.a}
                {item.q === 'What is the refund policy?' ? (
                  <>
                    {' '}
                    <Link href="/terms#payments-refunds-guarantees">Terms</Link>
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="lx3-close" id="close" aria-label="Choose your plan and start">
        <p className="lx3-eyebrow lx3-eyebrow-orange">Ready to start</p>
        <h2>Start with your goal.</h2>
        <p>
          Fat loss is 90 days · ₹599. Fat loss + muscle gain is 6 months · ₹999. Athletic body is 12 months · ₹1,699.
        </p>
        <div className="lx3-close-actions">
          {PLANS.map((plan) => (
            <PlanLink key={plan.slug} plan={plan} className={`lx3-close-btn lx3-close-${plan.tone}`}>
              {COACHING_PLANS[plan.slug].name} · {COACHING_PLANS[plan.slug].displayPrice}
            </PlanLink>
          ))}
        </div>
        <p className="lx3-terms">
          Service rules and refunds are in the <Link href="/terms#payments-refunds-guarantees">Terms</Link>.
        </p>
      </section>
    </div>
  )
}
