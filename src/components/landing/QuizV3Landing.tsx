'use client'

import { useState } from 'react'
import { PreviewAdCapture } from '@/components/studio/PreviewAdCapture'
import { PREVIEW7_AD_PATH, PREVIEW7_DROPOFF_SECTIONS } from '@/lib/analytics/ad-landing'
import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'
import { formatPreview7Inr, preview7AmountPaise } from '@/lib/payments/preview7-prices'
import { DirectCheckout } from './DirectCheckout'
import { InstantFitnessQuiz } from './InstantFitnessQuiz'
import { PreviewSaleProvider } from './PreviewSaleCode'
import styles from './QuizV3Landing.module.css'

const PLANS: {
  slug: CoachingPlanSlug
  duration: string
  points: string[]
  note?: string
  badge?: string
}[] = [
  {
    slug: '3_months',
    duration: '90 days',
    points: [
      'New workout + diet each week',
      'Trackers, coach chat, and Journey unlocked',
      'Weekly check-ins',
      'Progress photos',
    ],
  },
  {
    slug: '6_months',
    duration: '6 months',
    badge: 'Most popular',
    note: 'Everything in Fat loss, plus muscle programmed in for 6 months.',
    points: [
      'New workout + diet each week',
      'Trackers, coach chat, and Journey unlocked',
      'Weekly check-ins',
      'Fat loss and muscle in one plan',
    ],
  },
  {
    slug: '12_months',
    duration: '12 months',
    badge: 'Best value',
    note: 'Full year of coaching. Fat loss, muscle, and stamina in one plan.',
    points: [
      'New workout + diet each week',
      'Trackers, coach chat, and Journey unlocked',
      'Weekly check-ins all year',
      'Fat loss, muscle, and stamina',
    ],
  },
]

const FAQS = [
  {
    q: 'What happens after I pay?',
    a: 'Razorpay confirms the payment. We email the next steps. Create your login, finish a short assessment with progress photos, then your personal workout and diet lands in the app — usually within a few hours, always inside 48 hours.',
  },
  {
    q: 'How do you make sure I get what I paid for?',
    a: 'Your purchase is recorded against your email. If onboarding is complete and we do not deliver your first plan within 48 hours, you get a full refund if you request it within 7 days.',
  },
  {
    q: 'What exactly is included?',
    a: 'A new personal workout and diet each week, plus daily trackers, coach chat, and Journey already unlocked. Weekly check-ins and progress photos sit on top of that. No weekly phone calls — support is inside the app.',
  },
  {
    q: 'Is this real 1-to-1 coaching?',
    a: 'Yes. Your plan, check-ins, and progress are handled as your case — with personalised updates and chat support inside the app.',
  },
  {
    q: 'Gym or home? Beginners? Vegetarians?',
    a: 'All welcome. Plans are built for gym, home, or mixed setups, matched to your experience level, and diet is customised for vegetarian, vegan, and allergy needs.',
  },
]

function draftPaise(slug: CoachingPlanSlug) {
  return preview7AmountPaise(slug) ?? 0
}

function priceLabel(slug: CoachingPlanSlug) {
  return formatPreview7Inr(draftPaise(slug))
}

function perMonth(slug: CoachingPlanSlug) {
  return Math.round(draftPaise(slug) / 100 / COACHING_PLANS[slug].durationMonths)
}

export function QuizV3Landing() {
  return (
    <PreviewSaleProvider>
      <QuizV3View />
    </PreviewSaleProvider>
  )
}

function QuizV3View() {
  const [payPlan, setPayPlan] = useState<string | null>(null)
  const featured = COACHING_PLANS['6_months']
  const featuredPrice = priceLabel(featured.slug)

  return (
    <div className={styles.page}>
      <PreviewAdCapture
        path={PREVIEW7_AD_PATH}
        sections={PREVIEW7_DROPOFF_SECTIONS}
        funnelSource="preview7"
        viewKey="lx_preview7_view"
      />
      <header className={styles.bar}>
        <p>Affordable 1-to-1 online coaching in India</p>
        <a href="/login">Log in</a>
      </header>

      <main>
        <section className={styles.hero} id="top" aria-labelledby="p7-title">
          <div className={styles.heroCopy}>
            <h1 id="p7-title">
              Personalised fitness plans, <span>within a few hours.</span>
            </h1>
            <p>
              Coach-made workout and diet around your goals, from {priceLabel('3_months')}. You get a new plan every week, and trackers, coach chat, and Journey are already unlocked from day one.
            </p>
            <ul>
              <li>New weekly plans</li>
              <li>Trackers, coach chat, Journey unlocked</li>
              <li>Beginner friendly</li>
            </ul>
          </div>
          <div className={styles.portraits}>
            <a href="https://www.instagram.com/maximusvault/" target="_blank" rel="noreferrer">
              <img src="/landing/coach-piyush-dark.webp" alt="Piyush Aggarwal, LURVOX coach" />
              <strong>Piyush</strong>
              <span>@maximusvault</span>
            </a>
            <a href="https://www.instagram.com/rakshitmohla_/" target="_blank" rel="noreferrer">
              <img src="/landing/coach-rakshit-dark.webp" alt="Rakshit Mohla, LURVOX coach" />
              <strong>Rakshit</strong>
              <span>@rakshitmohla_</span>
            </a>
          </div>
        </section>

        <section className={styles.plans} id="plans" aria-labelledby="p7-plans">
          <p className={styles.eyebrow}>Choose your plan</p>
          <h2 id="p7-plans">Simple plans. Real coaching.</h2>
          <p className={styles.lede}>
            The price is for a new weekly plan plus trackers, coach chat, and Journey already unlocked — not a one-time PDF.
          </p>
          <div className={styles.grid}>
            {PLANS.map((item) => {
              const plan = COACHING_PLANS[item.slug]
              return (
                <article key={item.slug} className={item.badge ? styles.featured : undefined}>
                  {item.badge ? <p className={styles.badge}>{item.badge}</p> : null}
                  <p className={styles.duration}>{item.duration}</p>
                  <h3>{plan.name}</h3>
                  <p className={styles.price}>{priceLabel(item.slug)}</p>
                  <p className={styles.meta}>≈ ₹{perMonth(item.slug)}/month</p>
                  {item.note ? <p className={styles.note}>{item.note}</p> : null}
                  <ul>
                    {item.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => setPayPlan(item.slug)}>
                    Get {plan.name}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section className={styles.truth} id="truth" aria-labelledby="p7-truth">
          <p className={styles.eyebrow}>Truth check</p>
          <h2 id="p7-truth">Why we give results, but you fail</h2>
          <p className={styles.lede}>
            Most people fail on generic templates and gym myths. We build customised plans on science and coach principles.
          </p>
          <div className={styles.split}>
            <article>
              <h3>Why people fail</h3>
              <ul>
                <li>Generic AI plans copy the same template for everyone</li>
                <li>Old beliefs like “more sweat means more fat loss”</li>
                <li>Random YouTube workouts with no weekly structure</li>
                <li>Crash diets that crash your energy and adherence</li>
              </ul>
            </article>
            <article>
              <h3>Why our plans work</h3>
              <ul>
                <li>A new personal workout and diet every week</li>
                <li>Trackers, coach chat, and Journey unlocked from day one</li>
                <li>Science first: calories, protein, progressive overload, recovery</li>
                <li>Built for your schedule, gym or home, veg or mixed diet</li>
              </ul>
            </article>
          </div>
        </section>

        <section className={styles.steps} id="steps" aria-labelledby="p7-steps">
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="p7-steps">Your plan in 3 steps</h2>
          <ol>
            <li>
              <strong>Pay once</strong>
              <span>Checkout with Razorpay. UPI, cards, or netbanking. You get an email with every next step.</span>
            </li>
            <li>
              <strong>Create your account</strong>
              <span>We email the next steps. Finish the short assessment and photos in the app.</span>
            </li>
            <li>
              <strong>Receive your plan</strong>
              <span>First workout and diet in 24–48 hours, then a new plan each week. If the first plan does not arrive, you get a refund.</span>
            </li>
          </ol>
        </section>

        <section className={styles.faq} id="faq" aria-labelledby="p7-faq">
          <p className={styles.eyebrow}>FAQ</p>
          <h2 id="p7-faq">Questions before you start</h2>
          {FAQS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>

        <section className={styles.close} id="close" aria-labelledby="p7-close">
          <p className={styles.eyebrow}>Ready to start</p>
          <h2 id="p7-close">Start with your goal. We build everything around it.</h2>
          <p className={styles.lede}>
            Fat loss is 90 days · {priceLabel('3_months')}. Fat loss + muscle gain is 6 months · {priceLabel('6_months')}. Athletic body is 12 months · {priceLabel('12_months')}.
          </p>
          <button type="button" className={styles.primary} onClick={() => setPayPlan('6_months')}>
            Start with {featured.name} · {featuredPrice}
          </button>
          <p className={styles.fine}>
            Service rules, refunds, and any guarantees are only in the <a href="/terms">Terms</a>.
          </p>
        </section>

        <div id="quiz">
          <InstantFitnessQuiz offer="coaching" fromLabel={`See plans — from ${priceLabel('3_months')}`} />
        </div>
      </main>

      <div className={styles.sticky}>
        <div>
          <strong>{featured.name}</strong>
          <span>{featuredPrice} · 6 months</span>
        </div>
        <button type="button" onClick={() => setPayPlan(featured.slug)}>
          Start your transformation
        </button>
      </div>

      <DirectCheckout
        planSlug={payPlan}
        landingPath={PREVIEW7_AD_PATH}
        source="preview7"
        tone="orange"
        onClose={() => setPayPlan(null)}
      />
    </div>
  )
}
