'use client'

import { useState } from 'react'
import { coaches } from '@/lib/content'
import { PLAN_INCLUSIONS } from '@/lib/payments/plan-pages'
import { COACHING_PLANS, COACHING_PLAN_LIST, type CoachingPlanSlug } from '@/lib/payments/plans'
import { CampaignImage, CtaLink, PrimaryCta } from './primitives'

const entry = COACHING_PLANS['3_months']

const HERO_OPTIONS: {
  slug: CoachingPlanSlug
  label: string
  title: string
  duration: string
  image: string
  alt: string
}[] = [
  {
    slug: '3_months',
    label: 'Fat loss',
    title: 'Your fat loss plan.',
    duration: '90 days',
    image: '/images/lurvox/campaign/hero-fat-loss.webp',
    alt: 'Man walking uphill on a treadmill in a private gym',
  },
  {
    slug: '6_months',
    label: 'Muscle',
    title: 'Fat loss and muscle.',
    duration: '6 months',
    image: '/images/lurvox/campaign/hero-muscle.webp',
    alt: 'Man in a heavy squat in a private studio',
  },
  {
    slug: '12_months',
    label: 'Athletic',
    title: 'An athletic body.',
    duration: '12 months',
    image: '/images/lurvox/campaign/hero-athletic.webp',
    alt: 'Muscular man running in shorts along a waterfront at dawn',
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
            Log in
          </CtaLink>
          <details className="lx-menu">
            <summary>Menu</summary>
            <a href="#system">What’s included</a>
            <a href="#coaching">Coaches</a>
            <a href="#method">How it works</a>
            <a href="#pricing">Plans</a>
            <a href="/login">Log in</a>
          </details>
        </div>
      </div>
    </header>
  )
}

export function Hero({
  slug,
  onChange,
}: {
  slug: CoachingPlanSlug
  onChange: (slug: CoachingPlanSlug) => void
}) {
  const option = HERO_OPTIONS.find((item) => item.slug === slug) ?? HERO_OPTIONS[0]
  const plan = COACHING_PLANS[option.slug]
  const monthly = Math.round(plan.amountPaise / 100 / plan.durationMonths)
  return (
    <section className="lx-hero" id="top">
      <div className="lx-hero-copy">
        <p className="lx-eyebrow">Online coaching</p>
        <h1>{option.title}</h1>
        <p className="lx-lead">Workout, diet, and a coach. First plan in 24–48 hours.</p>
        <div className="lx-switch" role="tablist" aria-label="Coaching plans">
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
            </button>
          ))}
        </div>
        <div className="lx-hero-photo">
          <CampaignImage src={option.image} alt={option.alt} priority className="lx-cover" />
        </div>
        <p className="lx-price">
          <strong>{plan.displayPrice}</strong>
          <em>
            ₹{monthly} a month · {option.duration}
          </em>
        </p>
        <div className="lx-actions">
          <PrimaryCta plan={option.slug} className="lx-btn-block">
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
      image: '/images/lurvox/campaign/intake-morning.webp',
      alt: 'Woman with coffee and a gym bag before training',
    },
    {
      n: '02',
      title: 'It keeps up',
      body: 'The 3-month plan updates every 14 days. The 6- and 12-month plans update every week.',
      image: '/images/lurvox/campaign/weekly-checkin.webp',
      alt: 'Woman by a window during a weekly check-in',
    },
    {
      n: '03',
      title: 'Made with tested principles',
      body: 'The workout and diet are made from tested training and nutrition principles, then written for your case. There are no live calls.',
      image: '/landing/instant-coach-piyush.png',
      alt: 'Piyush Aggarwal, LURVOX coach',
    },
    {
      n: '04',
      title: 'The work is decided',
      body: 'What to train and what to eat is written. You are not left choosing it alone.',
      image: '/images/lurvox/campaign/training-session.webp',
      alt: 'Man performing a seated cable row',
    },
  ]
  const [active, setActive] = useState(0)
  const current = problems[active]
  return (
    <section className="lx-fail" id="why">
      <p className="lx-eyebrow">With LURVOX</p>
      <h2>Why you won&apos;t fail with us.</h2>
      <p className="lx-lead">The plan is built for your case, and it does not stop at a file.</p>
      <div className="lx-stage">
        {current.n === '03' ? (
          <div className="lx-stage-split">
            {coaches.map((coach) => (
              <img key={coach.instagramHandle} src={coach.photo} alt={`${coach.name}, LURVOX coach`} />
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
            {item.n === '03' ? (
              <span className="lx-thumb-split">
                {coaches.map((coach) => (
                  <img key={coach.instagramHandle} src={coach.photo} alt="" />
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
      body: 'Piyush Aggarwal and Rakshit Mohla review your case in the app. There are no live calls.',
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
      body: 'Piyush Aggarwal and Rakshit Mohla reply in the app. No live calls.',
      images: coaches.map((coach) => ({
        src: coach.photo,
        alt: `${coach.name}, LURVOX coach`,
      })),
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
      <p className="lx-lead">The workout, the diet, the check-ins, and a coach reading them.</p>
      <ul className="lx-include">
        {PLAN_INCLUSIONS.map((item) => (
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

export function Coaching() {
  return (
    <section className="lx-coaches" id="coaching">
      <div className="lx-coaches-copy">
        <p className="lx-eyebrow">Human coaching</p>
        <h2>
          Technology
          <br />
          organizes it.
        </h2>
        <h2>
          People
          <br />
          guide you.
        </h2>
        <p className="lx-lead">
          Piyush Aggarwal and Rakshit Mohla work inside the app. LURVOX does not do live calls.
        </p>
      </div>
      <div className="lx-coach-row">
        {coaches.map((coach) => (
          <a key={coach.instagramHandle} href={coach.instagramUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- real coach photographs */}
            <img src={coach.photo} alt={`${coach.name}, LURVOX coach`} />
            <span>
              <strong>{coach.name}</strong>
              <em>{coach.instagramHandle}</em>
            </span>
          </a>
        ))}
      </div>
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
      image: '/images/lurvox/campaign/training-session.webp',
      alt: 'Man performing a seated cable row',
      ui: false,
    },
    {
      n: '04',
      title: 'Adapt.',
      body: 'Check in. The plan changes from what you actually did.',
      image: '/images/lurvox/campaign/weekly-checkin.webp',
      alt: 'Woman by a window during a weekly check-in',
      ui: false,
    },
  ]
  const [active, setActive] = useState(0)
  const current = steps[active]
  return (
    <section className="lx-method" id="method">
      <p className="lx-eyebrow">How it works</p>
      <h2>Then it adapts.</h2>
      <div className="lx-stage lx-method-stage">
        <CampaignImage
          key={current.n}
          src={current.image}
          alt={current.alt}
          className="lx-cover"
        />
      </div>
      <div className="lx-method-copy">
        <h3>{current.title}</h3>
        <p>{current.body}</p>
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

const PLAN_POINTS: Record<CoachingPlanSlug, string[]> = {
  '3_months': [
    'Workout and diet for your case',
    'Coach in the app. No live calls',
    'Check-ins and daily tracking',
    'Updates every 14 days',
  ],
  '6_months': [
    'Everything in Fat loss',
    'Updates every week',
    'Cardio plan',
    'Supplement plan',
    'Plateau coaching after 90 days',
  ],
  '12_months': [
    'Everything in Fat loss + muscle gain',
    'Stamina coaching',
    'Weekly updates for 12 months',
    'Cardio and supplements, kept current',
    'Plateau coaching through the year',
    'Lowest rate, ₹142 a month',
  ],
}

export function Pricing() {
  return (
    <section className="lx-pricing" id="pricing">
      <p className="lx-eyebrow">Plans</p>
      <h2>Choose your plan.</h2>
      <p className="lx-shared">
        Every plan includes personalized coaching, a workout, a diet, tracking and coach check-ins. A free
        upgrade is available for 48 hours. After that, an upgrade is ₹250.
      </p>
      <div className="lx-plans">
        {COACHING_PLAN_LIST.map((plan) => (
          <article
            key={plan.slug}
            className={[plan.popular ? 'is-popular' : '', plan.best ? 'is-best' : ''].filter(Boolean).join(' ') || undefined}
          >
            <p className="lx-kicker">
              {plan.durationMonths === 3 ? '90 days' : `${plan.durationMonths} months`}
              {plan.popular ? <span className="lx-tag">Most popular</span> : null}
              {plan.best ? <span className="lx-tag">Lowest monthly</span> : null}
            </p>
            <h3>{plan.name}</h3>
            <p className="lx-plan-price">
              {plan.displayPrice}
              <em>₹{Math.round(plan.amountPaise / 100 / plan.durationMonths)} a month</em>
            </p>
            <ul className="lx-points">
              {PLAN_POINTS[plan.slug].map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <PrimaryCta plan={plan.slug} className="lx-btn-block">
              Start for {plan.displayPrice}
            </PrimaryCta>
          </article>
        ))}
      </div>
    </section>
  )
}

export function FaqSection() {
  const items = [
    ['What is LURVOX?', 'Online fitness coaching. A personal workout, a personal diet, tracking, and a coach in the app.'],
    ['What do I receive?', 'The plan for the goal you choose, check-ins, daily tracking, and coach chat. The 3-month plan updates every 14 days. The 6- and 12-month plans update every week.'],
    ['How does the coach work?', 'Piyush Aggarwal and Rakshit Mohla review your case in the app. There are no live calls.'],
    ['When do I receive my plan?', 'After you finish onboarding. The first plan is prepared in 24 to 48 hours.'],
    ['Do I need a gym?', 'No. The plan uses a gym, home, or a mix, based on what you have.'],
    ['Can I message my coach?', 'Yes, in the app, once your coaching access is active.'],
    ['What happens during weekly check-ins?', 'You submit the week, including photos when they are required. Your coach reviews it and the plan can change from that.'],
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

export function FinalCta() {
  return (
    <section className="lx-final">
      <div className="lx-final-copy">
        <h2>Your next 90 days start here.</h2>
        <p className="lx-price">
          <span>Starting from</span>
          <strong>{entry.displayPrice}</strong>
        </p>
        <PrimaryCta>Start for {entry.displayPrice}</PrimaryCta>
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
