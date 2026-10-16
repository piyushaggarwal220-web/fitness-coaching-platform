'use client'

import { useState } from 'react'
import { coaches } from '@/lib/content'
import { INSTANT_PLAN_WINDOW_LABEL } from '@/lib/plan-delivery-window'
import { DURATION_OFFER_POINTS, DURATION_OFFER_RECEIVE } from '@/lib/payments/duration-offer-points'
import { PLAN_INCLUSIONS } from '@/lib/payments/plan-pages'
import {
  DURATION_OFFER_PLANS,
  DURATION_PLAN_LIST,
  COACHING_PLAN_LIST,
  type DurationOfferSlug,
} from '@/lib/payments/plans'
import { CampaignImage, CtaLink, PrimaryCta } from './primitives'

const entry = DURATION_OFFER_PLANS.offer_3_months

const HERO_OPTIONS: {
  slug: DurationOfferSlug
  label: string
  title: string[]
  lead: string
  duration: string
  image: string
  alt: string
}[] = [
  {
    slug: 'offer_1_month',
    label: 'Starter',
    title: ['The starter.', 'One month.'],
    lead: 'Diet, workout, sleep, and cardio, written for the week you actually have.',
    duration: '1 month',
    image: '/images/lurvox/campaign/hero-fat-loss.webp',
    alt: 'Man walking uphill on a treadmill in a private gym',
  },
  {
    slug: 'offer_3_months',
    label: 'Finisher',
    title: ['The finisher.', 'Three months.'],
    lead: 'The starter stays. The finisher adds the time, and a few extras.',
    duration: '3 months',
    image: '/images/lurvox/campaign/hero-muscle.webp',
    alt: 'Man in a heavy squat in a private studio',
  },
]

export function Nav() {
  return (
    <header className="lx-header">
      <div className="lx-nav">
        <nav className="lx-nav-links" aria-label="Page">
          <a href="#system">What’s included</a>
          <a href="#coaching">Coaches</a>
          <a href="#method">How it works</a>
          <a href="#pricing">Plans</a>
        </nav>
        <a href="#top" className="lx-logo">
          LURVOX
        </a>
        <div className="lx-nav-actions">
          <CtaLink href="/login" variant="ghost" className="lx-login">
            Client login
          </CtaLink>
        </div>
      </div>
    </header>
  )
}

export function Hero({
  slug,
  onChange,
  onPay,
}: {
  slug: DurationOfferSlug
  onChange: (slug: DurationOfferSlug) => void
  onPay?: (plan: string) => void
}) {
  const option = HERO_OPTIONS.find((item) => item.slug === slug) ?? HERO_OPTIONS[1]
  const plan = DURATION_OFFER_PLANS[option.slug]
  const monthly = Math.round(plan.amountPaise / 100 / plan.durationMonths)
  return (
    <section className="lx-hero" id="top">
      <div className="lx-hero-copy">
        <p className="lx-eyebrow">Online coaching</p>
        <h1>
          {option.title.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
        <p className="lx-lead">{option.lead}</p>
        <div className="lx-switch" role="tablist" aria-label="Choose how long">
          {HERO_OPTIONS.map((item) => (
            <button
              key={item.slug}
              type="button"
              role="tab"
              aria-selected={item.slug === option.slug}
              className={item.slug === option.slug ? 'is-on' : undefined}
              onClick={() => onChange(item.slug)}
            >
              {item.label}
              <strong>{item.duration}</strong>
            </button>
          ))}
        </div>
        <div className="lx-hero-photo">
          <CampaignImage src={option.image} alt={option.alt} priority className="lx-cover" />
        </div>
        <p className="lx-price">
          <strong>{plan.displayPrice}</strong>
          <em>
            {plan.durationMonths === 1 ? 'for 1 month' : `for 3 months · ₹${monthly} a month`}
          </em>
        </p>
        <div className="lx-actions">
          <PrimaryCta plan={option.slug} className="lx-btn-block" source="preview4" landingPath="/preview4" onPay={onPay}>
            Start for {plan.displayPrice}
          </PrimaryCta>
        </div>
      </div>
    </section>
  )
}

export function Included() {
  const loop = [...PLAN_INCLUSIONS, ...PLAN_INCLUSIONS]
  return (
    <section className="lx-marquee" aria-label="Included in every plan">
      <div className="lx-marquee-track">
        {loop.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </section>
  )
}

export function WhyFail() {
  const problems = [
    {
      n: '01',
      title: 'Your plan',
      body: 'The workout and the diet are built around your goal, schedule, food, and where you train.',
      image: '/images/lurvox/campaign/why-plan.webp',
      alt: 'Man at a kitchen table with a closed notebook before training',
    },
    {
      n: '02',
      title: 'It keeps up',
      body: 'You get a diet chart, a diet plan, a workout plan, and guidance for sleep, cardio, and supplements.',
      image: '/images/lurvox/campaign/why-keeps.webp',
      alt: 'Man setting a dumbbell down beside a window after a week of training',
    },
    {
      n: '03',
      title: 'Made with tested principles',
      body: 'The workout and diet follow professional principles, backed by science, then written for your case.',
      image: '/images/lurvox/campaign/why-principles.webp',
      alt: 'Woman holding a kettlebell in a careful hinge in an empty studio',
    },
    {
      n: '04',
      title: 'The work is decided',
      body: 'What to train and what to eat is written. You are not left choosing it alone.',
      image: '/images/lurvox/campaign/why-work.webp',
      alt: 'Man standing ready in front of a loaded barbell',
    },
  ]
  const [active, setActive] = useState(0)
  const current = problems[active]
  return (
    <section className="lx-fail" id="why">
      <p className="lx-eyebrow">With LURVOX</p>
      <h2>Why you won&apos;t fail with us.</h2>
      <p className="lx-lead">A plan for your week. Not a file you have to figure out.</p>
      <div className="lx-stage">
        <img key={current.n} className="lx-cover" src={current.image} alt={current.alt} />
        <div className="lx-stage-copy">
          <h2>{current.title}</h2>
          <p>{current.body}</p>
        </div>
      </div>
      <div className="lx-stage-nav lx-quad-nav" role="tablist" aria-label="Why you won't fail with us">
        {problems.map((item, index) => (
          <button
            key={item.n}
            type="button"
            role="tab"
            aria-selected={index === active}
            className={index === active ? 'is-on' : undefined}
            onClick={() => setActive(index)}
          >
            <img src={item.image} alt="" />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function Difference() {
  const pillars = [
    {
      n: '01',
      title: 'Personalized',
      body: 'Your plan is built around your goal, experience, schedule, and where you train.',
      image: '/images/lurvox/campaign/intake-morning.webp',
      alt: 'Woman with coffee and a gym bag before training',
    },
    {
      n: '02',
      title: 'Human coaching',
      body: 'Piyush Aggarwal and Rakshit Mohla guide your case in the app — plans built on tested principles, not random templates.',
      images: coaches.map((coach) => ({ src: coach.photo, alt: `${coach.name}, LURVOX coach` })),
    },
    {
      n: '03',
      title: 'Adaptive',
      body: 'The 3-month plan updates every 14 days. The 6- and 12-month plans update every week.',
      image: '/images/lurvox/campaign/plan-arrived.webp',
      alt: 'Man reading a phone after training',
    },
    {
      n: '04',
      title: 'Accountable',
      body: 'Mid-week and weekly check-ins. You are not left alone with a file.',
      image: '/images/lurvox/campaign/weekly-checkin.webp',
      alt: 'Woman by a window during a weekly check-in',
    },
  ]
  const [active, setActive] = useState(0)
  const current = pillars[active]
  return (
    <section className="lx-manifesto" id="difference">
      <p className="lx-eyebrow">Why LURVOX</p>
      <h2>Not another workout plan.</h2>
      <p className="lx-lead">
        That is what LURVOX is built to fix. Personalized training, nutrition, tracking, and a coach, in one system.
      </p>
      <div className="lx-stage">
        {'images' in current && current.images ? (
          <div className="lx-stage-split">
            {current.images.map((image) => (
              <img key={image.src} src={image.src} alt={image.alt} />
            ))}
          </div>
        ) : (
          <img key={current.n} className="lx-cover" src={current.image} alt={current.alt} />
        )}
      </div>
      <div className="lx-method-copy">
        <h3>{current.title}</h3>
        <p>{current.body}</p>
      </div>
      <div className="lx-stage-nav lx-quad-nav" role="tablist" aria-label="Why LURVOX">
        {pillars.map((item, index) => (
          <button
            key={item.n}
            type="button"
            role="tab"
            aria-selected={index === active}
            className={index === active ? 'is-on' : undefined}
            onClick={() => setActive(index)}
          >
            {'images' in item && item.images ? (
              <span className="lx-thumb-split">
                {item.images.map((image) => (
                  <img key={image.src} src={image.src} alt="" />
                ))}
              </span>
            ) : (
              <img src={item.image} alt="" />
            )}
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function Statement() {
  return (
    <section className="lx-statement" aria-label="What LURVOX is">
      <h2>
        Your body
        <br />
        isn&apos;t a template.
      </h2>
      <h2>
        Your plan
        <br />
        shouldn&apos;t be one either.
      </h2>
      <p>
        LURVOX combines personalized training, nutrition, tracking and human coaching into one system.
      </p>
    </section>
  )
}

export function Goals() {
  const bands = [
    {
      plan: '3_months' as const,
      title: 'Lose fat.',
      time: '90 days',
      cta: 'Explore fat loss',
      image: '/images/lurvox/dark/fat-loss.webp',
      alt: 'Woman in a modern apartment in morning light',
    },
    {
      plan: '6_months' as const,
      title: 'Build muscle.',
      time: '6 months',
      cta: 'Explore muscle',
      image: '/images/lurvox/dark/muscle.webp',
      alt: 'Man training with a barbell in a private gym',
      flip: true,
    },
    {
      plan: '12_months' as const,
      title: 'Become athletic.',
      time: '12 months',
      cta: 'Explore athletic',
      image: '/images/lurvox/dark/athletic.webp',
      alt: 'Woman running through a modern city at sunrise',
    },
  ]
  return (
    <section id="goals" aria-label="Goals">
      {bands.map((band) => {
        const plan = COACHING_PLAN_LIST.find((item) => item.slug === band.plan)
        return (
          <article key={band.plan} className={band.flip ? 'lx-band lx-band-flip' : 'lx-band'}>
            <CampaignImage src={band.image} alt={band.alt} className="lx-cover" />
            <div className="lx-band-copy">
              <p className="lx-kicker">{band.time}</p>
              <h2>{band.title}</h2>
              <p className="lx-lead">{plan?.displayPrice}</p>
              <PrimaryCta plan={band.plan}>{band.cta}</PrimaryCta>
            </div>
          </article>
        )
      })}
    </section>
  )
}

export function System() {
  const items = [
    {
      title: 'Workout',
      body: 'Sessions for your goal, level, and equipment.',
      images: [{ src: '/images/lurvox/campaign/training-session.webp', alt: 'Man performing a seated cable row' }],
    },
    {
      title: 'Diet',
      body: 'Meals around your food and schedule.',
      images: [{ src: '/images/lurvox/campaign/nutrition-meal.webp', alt: 'A plated meal of chicken, rice, roti, and greens' }],
    },
    {
      title: 'Track',
      body: 'Log the workout and the meals, then leave.',
      images: [{ src: '/images/lurvox/campaign/tracking-review.webp', alt: 'Woman reviewing her day on a phone after training' }],
    },
    {
      title: 'Coach',
      body: 'Piyush Aggarwal and Rakshit Mohla reply in the app.',
      images: coaches.map((coach) => ({ src: coach.photo, alt: `${coach.name}, LURVOX coach` })),
    },
    {
      title: 'Check-in',
      body: 'Mid-week and weekly. Weight, measurements, and photos when they are required.',
      images: [{ src: '/images/lurvox/campaign/weekly-checkin.webp', alt: 'Woman by a window during a weekly check-in' }],
    },
    {
      title: 'Progress',
      body: 'Weight, photos, and the plan that follows.',
      images: [{ src: '/images/lurvox/campaign/progress-leave.webp', alt: 'Man leaving a private gym after training' }],
    },
  ]
  const [active, setActive] = useState(0)
  const current = items[active]
  return (
    <section className="lx-system" id="system">
      <p className="lx-eyebrow">What you get</p>
      <h2>One system. Your case.</h2>
      <p className="lx-lead">Diet, workout, sleep, cardio, then the check-ins and the trackers.</p>
      <ul className="lx-include">
        {DURATION_OFFER_POINTS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="lx-stage">
        {current.images.length > 1 ? (
          <div className="lx-stage-split">
            {current.images.map((image) => (
              <img key={image.src} src={image.src} alt={image.alt} />
            ))}
          </div>
        ) : (
          <CampaignImage
            key={current.title}
            src={current.images[0].src}
            alt={current.images[0].alt}
            className="lx-cover"
          />
        )}
        <div className="lx-stage-copy">
          <h2>{current.title}</h2>
          <p>{current.body}</p>
        </div>
      </div>
      <div className="lx-stage-nav" role="tablist" aria-label="Parts of the coaching">
        {items.map((item, index) => (
          <button
            key={item.title}
            type="button"
            role="tab"
            aria-selected={index === active}
            className={index === active ? 'is-on' : undefined}
            onClick={() => setActive(index)}
          >
            {item.images.length > 1 ? (
              <span className="lx-thumb-split">
                {item.images.map((image) => (
                  <img key={image.src} src={image.src} alt="" />
                ))}
              </span>
            ) : (
              <img src={item.images[0].src} alt="" />
            )}
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function CoachSwitch() {
  const [active, setActive] = useState(0)
  const coach = coaches[active]
  return (
    <>
      <div className="lx-stage">
        <a href={coach.instagramUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- real coach photograph */}
          <img className="lx-cover" src={coach.photo} alt={`${coach.name}, LURVOX coach`} />
        </a>
        <div className="lx-stage-copy">
          <h2>{coach.name}</h2>
          <p>{coach.instagramHandle}</p>
          <p>Tap to open Instagram</p>
        </div>
      </div>
      <div className="lx-stage-nav lx-coach-nav" role="tablist" aria-label="Coaches">
        {coaches.map((item, index) => (
          <button
            key={item.instagramHandle}
            type="button"
            role="tab"
            aria-selected={index === active}
            className={index === active ? 'is-on' : undefined}
            onClick={() => setActive(index)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- real coach photograph */}
            <img src={item.photo} alt="" />
            <span>{item.firstName}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export function Coaching() {
  return (
    <section className="lx-coaches" id="coaching">
      <div className="lx-coaches-copy">
        <p className="lx-eyebrow">The method</p>
        <h2>Get trained with professional principles.</h2>
        <p className="lx-lead">Backed by science, not random things.</p>
      </div>
      <CoachSwitch />
    </section>
  )
}

export function AppExperience() {
  const tiles = [
    ['Today', 'Workout, meals, and what is still open.', 'wide'],
    ['Workout', 'Sets, reps, rest, and the next exercise.', ''],
    ['Diet', 'Meals and quantities for the day.', ''],
    ['Track', 'Water, sleep, steps, and the session log.', ''],
    ['Check-in', 'What is due, and the photos when they are required.', ''],
    ['Coach', 'Who replied, and what to do next.', ''],
    ['Journey', 'Where you started, and the current phase.', 'wide'],
  ]
  return (
    <section className="lx-app" id="app">
      <p className="lx-kicker">The app</p>
      <h2>Your coaching, in one place.</h2>
      <p className="lx-lead">Workout, meals, tracking, check-ins and coach chat. These are the real sections.</p>
      <div className="lx-bento">
        {tiles.map(([title, body, size]) => (
          <article key={title} className={size ? 'is-wide' : undefined}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function Editorial() {
  return (
    <>
      <article className="lx-editorial">
        <CampaignImage
          src="/images/lurvox/dark/train.webp"
          alt="Man training in a private gym"
          className="lx-cover"
        />
        <div>
          <p className="lx-kicker">Train</p>
          <h2>Train with purpose.</h2>
          <p>Your workouts are structured around your goal, experience, schedule and available equipment.</p>
        </div>
      </article>
      <article className="lx-editorial lx-editorial-flip">
        <CampaignImage
          src="/images/lurvox/dark/eat.webp"
          alt="A plated meal in a modern kitchen"
          className="lx-cover"
        />
        <div>
          <p className="lx-kicker">Eat</p>
          <h2>
            Eat like it&apos;s
            <br />
            part of the plan.
          </h2>
          <p>A diet built around the food you actually eat, not a generic meal-prep grid.</p>
        </div>
      </article>
      <article className="lx-editorial">
        <CampaignImage
          src="/images/lurvox/dark/recover.webp"
          alt="Woman resting in morning light"
          className="lx-cover"
        />
        <div>
          <p className="lx-kicker">Recover</p>
          <h2>
            Recovery
            <br />
            is training too.
          </h2>
          <p>Sleep, walking, and days that are not spent in the gym are part of the plan.</p>
        </div>
      </article>
    </>
  )
}

export function Method() {
  const steps = [
    {
      n: '01',
      title: 'Tell us about you.',
      body: 'Goals, schedule, food, and where you train.',
      image: '/images/lurvox/campaign/intake-morning.webp',
      alt: 'Woman with coffee and a gym bag before training',
      ui: false,
    },
    {
      n: '02',
      title: 'Get your plan.',
      body: 'Workout and diet, prepared for your case.',
      image: '/images/lurvox/campaign/plan-arrived.webp',
      alt: 'Man reading a phone after training',
      ui: false,
    },
    {
      n: '03',
      title: 'Do the work.',
      body: 'Train, eat, and log it in the app.',
      image: '/images/lurvox/campaign/method-work.webp',
      alt: 'Woman rowing in a quiet private studio',
      ui: false,
    },
    {
      n: '04',
      title: 'Adapt.',
      body: 'Check in. The plan changes from what you actually did.',
      image: '/images/lurvox/campaign/method-adapt.webp',
      alt: 'Man on a balcony after training, looking out at dusk',
      ui: false,
    },
  ]
  const [active, setActive] = useState(0)
  const current = steps[active]
  return (
    <section className="lx-method" id="method">
      <h2>How it works.</h2>
      <div className="lx-stage lx-method-stage">
        <CampaignImage
          key={current.n}
          src={current.image}
          alt={current.alt}
          className="lx-cover"
        />
        <div className="lx-stage-copy">
          <h2>{current.title}</h2>
          <p>{current.body}</p>
        </div>
      </div>
      <div className="lx-stage-nav lx-method-nav" role="tablist" aria-label="How it works">
        {steps.map((step, index) => (
          <button
            key={step.n}
            type="button"
            role="tab"
            aria-selected={index === active}
            className={index === active ? 'is-on' : undefined}
            onClick={() => setActive(index)}
          >
            <img src={step.image} alt="" />
            <span>{step.title.replace(/\.$/, '')}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

const MONTH_CARD_POINTS: { text: string; note?: string; gold?: boolean }[] = [
  { text: 'Diet, workout, sleep, and cardio' },
  { text: 'Wednesday and Sunday check-ins', note: 'Twice a week, on the platform' },
  { text: 'Coach chat' },
  { text: 'Diet tracker' },
  { text: 'Workout tracker' },
]

const THREE_MONTH_CARD_POINTS: { text: string; note?: string; gold?: boolean }[] = [
  { text: 'Everything in the starter' },
  { text: 'Testosterone boosting protocol', note: 'Free for men', gold: true },
  { text: 'Hourglass figure', note: 'For females', gold: true },
  { text: 'Journey plan' },
]

export function Pricing({ onPay }: { onPay?: (plan: string) => void }) {
  return (
    <section className="lx-pricing" id="pricing">
      <p className="lx-eyebrow">Plans</p>
      <h2>The starter, or the finisher.</h2>
      <p className="lx-shared">The finisher keeps the starter, then goes further.</p>
      <div className="lx-plans">
        {DURATION_PLAN_LIST.map((plan) => {
          const points = plan.durationMonths === 1 ? MONTH_CARD_POINTS : THREE_MONTH_CARD_POINTS
          return (
          <article key={plan.slug} className={plan.best ? 'is-best' : undefined}>
            <p className="lx-kicker">
              <span className="lx-length">{plan.durationMonths === 1 ? '1 month' : '3 months'}</span>
              {plan.best ? <span className="lx-tag">Best value</span> : <span className="lx-tag">Full access</span>}
            </p>
            <h3>{plan.durationMonths === 1 ? 'The starter' : 'The finisher'}</h3>
            <p className="lx-plan-price">
              {plan.displayPrice}
              <em>
                {plan.durationMonths === 1
                  ? 'for 1 month'
                  : `for 3 months · ₹${Math.round(plan.amountPaise / 100 / plan.durationMonths)} a month`}
              </em>
            </p>
            <ul className="lx-points">
              {points.map((point) => (
                <li key={point.text} className={point.gold ? 'is-gold' : undefined}>
                  {point.text}
                  {point.note ? <em>{point.note}</em> : null}
                </li>
              ))}
            </ul>
            <PrimaryCta plan={plan.slug} className="lx-btn-block" source="preview4" landingPath="/preview4" onPay={onPay}>
              Start for {plan.displayPrice}
            </PrimaryCta>
          </article>
          )
        })}
      </div>
    </section>
  )
}

export function FaqSection() {
  const items = [
    ['What is LURVOX?', 'Online fitness coaching. A diet chart, a diet plan, a workout plan, guidance, check-in, and coach chat in the app.'],
    ['What do I receive?', `${DURATION_OFFER_RECEIVE} 1 month is ₹249. 3 months is ₹499.`],
    ['What is the training based on?', 'Professional principles, backed by science. Not random workouts or diets.'],
    ['When do I receive my plan?', `After you finish onboarding and the required photos, the first plan arrives within ${INSTANT_PLAN_WINDOW_LABEL}.`],
    ['Do I need a gym?', 'No. The plan uses a gym, home, or a mix, based on what you have.'],
    ['Can I message my coach?', 'Yes, in the app, once your coaching access is active.'],
    ['What happens at check-in?', 'You submit the check-in, including photos when they are required. Your coach reviews it.'],
    ['What is the refund policy?', 'Sales are final once payment is captured, except where the Terms say otherwise. The Terms are the only refund rules.'],
  ]
  return (
    <section className="lx-faq" id="faq">
      <h2>Questions</h2>
      {items.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
      <p className="lx-note">
        <a href="/terms#payments-refunds-guarantees">Read the Terms</a>
      </p>
    </section>
  )
}

export function FinalCta({ onPay }: { onPay?: (plan: string) => void }) {
  return (
    <section className="lx-final" id="close">
      <div className="lx-final-copy">
        <h2>Start it, or finish it.</h2>
        <p className="lx-price">
          <span>1 month ₹249 · 3 months ₹499</span>
        </p>
        <PrimaryCta plan="offer_3_months" source="preview4" landingPath="/preview4" onPay={onPay}>
          Start for {entry.displayPrice}
        </PrimaryCta>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="lx-footer">
      <strong>LURVOX</strong>
      <p>Online fitness coaching.</p>
      <p>14, Sector 44, Golf Course Road, Gurugram, Haryana 122003</p>
      <p>
        <a href="mailto:hello@lurvox.in">hello@lurvox.in</a>
      </p>
      <p>
        <a href="/terms">Terms</a>
        <a href="/refund-policy">Refund policy</a>
        <a href="/login">Log in</a>
      </p>
      <p>Secure payments via Razorpay. Results vary.</p>
    </footer>
  )
}
