'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, Dumbbell, Smartphone, UserRound } from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { DIGITAL_PLAN_LIST } from '@/lib/payments/plans'
import styles from './customised-plan.module.css'

const COMPLETE_HREF = '/checkout?plan=digital_complete'

const PLAN_BULLETS: Record<string, string[]> = {
  digital_workout: [
    'Workout guidance made by the coach',
    'Sets and reps',
    'Weekly structure',
    'Built from your answers',
  ],
  digital_diet: [
    'Diet chart made by the coach',
    'Meals with quantities',
    'Calorie focused',
    'Built from your answers',
  ],
  digital_complete: [
    'Workout guidance',
    'Diet chart',
    'Sleep guidance',
    'Cardio guidance',
    'Water intake guidance',
    'Supplement guidance (optional)',
  ],
}

const FAQS = [
  {
    q: 'Is this plan really personalised?',
    a: 'Yes. After payment you complete a short in app questionnaire. Your plan is built around your goals, lifestyle, preferences, experience, and requirements.',
  },
  {
    q: 'What happens after I pay?',
    a: 'Verify your email, create your login, then open plan setup in the app. Complete the short questionnaire so we can prepare your plan.',
  },
  {
    q: 'How will I receive my plan?',
    a: 'Within a few hours of finishing onboarding, your plan appears in the app under My Plan and we email you a link. This is a written plan, not live chat coaching.',
  },
  {
    q: 'Can I choose my fitness goal?',
    a: 'Yes. Tell us your goal during onboarding: fat loss, muscle gain, strength, or general fitness.',
  },
  {
    q: 'Do I need gym experience?',
    a: 'No. Beginner to advanced. Your experience level is considered when preparing the plan.',
  },
  {
    q: 'Is this a subscription?',
    a: 'No. One time payment. No recurring subscription or membership fee.',
  },
  {
    q: 'Who makes the plan?',
    a: 'Your plan is made by the coach. For live checkins and chat, choose a coaching membership on lurvox.in.',
  },
]

export default function CustomisedPlanLandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [showSticky, setShowSticky] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 420)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <main className={styles.page}>
      <div className={styles.ticker} aria-hidden>
        <div className={styles.tickerTrack}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i}>One time payment · No subscriptions · Digital delivery · </span>
          ))}
        </div>
      </div>

      <header className={styles.topBar}>
        <p className={styles.wordmark}>{BRAND_NAME}</p>
        <Link href={COMPLETE_HREF} className={styles.topCta}>
          Get Complete · ₹99
        </Link>
      </header>

      <section className={styles.hero}>
        <motion.div
          className={styles.heroCopy}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className={styles.eyebrow}>Personalised fitness plans</p>
          <h1 className={styles.headline}>
            Personal diet and workout,
            <span> within a few hours.</span>
          </h1>
          <p className={styles.lede}>
            Coach made plans around your goals, from ₹49. Delivered to email and the app.
            Written guidance, not live coaching.
          </p>
          <div className={styles.ctaRow}>
            <Link href={COMPLETE_HREF} className={styles.primaryCta}>
              <span className={styles.ctaFull}>Get Complete Plan · ₹99</span>
              <span className={styles.ctaShort}>Get Complete · ₹99</span>
            </Link>
            <a href="#plans" className={styles.secondaryCta}>
              See all plans
            </a>
          </div>
          <ul className={styles.trustRow}>
            <li>
              <UserRound size={16} aria-hidden /> Made by the coach
            </li>
            <li>
              <Smartphone size={16} aria-hidden /> Digital delivery
            </li>
            <li>
              <Dumbbell size={16} aria-hidden /> Beginner friendly
            </li>
          </ul>
        </motion.div>

        <motion.div
          className={styles.heroVisual}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.heroPortraitsWrap}>
            <div className={styles.heroPortraits}>
              <figure className={styles.heroPortrait}>
                <Image
                  src="/landing/instant-coach-piyush.png"
                  alt="Piyush, Lurvox coach"
                  fill
                  priority
                  sizes="(max-width: 900px) 45vw, 280px"
                  className={styles.heroImage}
                />
                <figcaption className={styles.heroCaption}>Piyush</figcaption>
              </figure>
              <figure className={styles.heroPortrait}>
                <Image
                  src="/landing/instant-coach-rakshit.png"
                  alt="Rakshit, Lurvox coach"
                  fill
                  priority
                  sizes="(max-width: 900px) 45vw, 280px"
                  className={styles.heroImage}
                />
                <figcaption className={styles.heroCaption}>Rakshit</figcaption>
              </figure>
            </div>
            <div className={styles.photoHeadline}>
              <p className={styles.photoHeadlineMain}>Transformed over 7000 people</p>
              <p className={styles.photoHeadlineSub}>Moneyback guarantee if no results</p>
            </div>
          </div>
          <p className={styles.coachLine}>Piyush and Rakshit · Lurvox coaches</p>
        </motion.div>
      </section>

      <section id="plans" className={styles.section}>
        <p className={styles.sectionEyebrow}>Choose your plan</p>
        <h2 className={styles.sectionTitle}>Simple plans. Real structure.</h2>
        <p className={styles.sectionLede}>
          One time payment. Honest prices. No fake discounts.
        </p>

        <div className={styles.planStack}>
          {DIGITAL_PLAN_LIST.map((plan, index) => (
            <motion.article
              key={plan.slug}
              className={`${styles.planCard} ${plan.popular ? styles.planCardPopular : ''}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: index * 0.06, duration: 0.4 }}
            >
              {plan.popular ? <p className={styles.popularTag}>Most popular</p> : null}
              <h3>{plan.name}</h3>
              <p className={styles.planPrice}>{plan.displayPrice}</p>
              <p className={styles.planMeta}>{plan.saveLabel}</p>
              {plan.slug === 'digital_complete' ? (
                <p className={styles.planValueNote}>
                  ₹49 and ₹89 separately is ₹138. Complete Guidance is ₹99, with sleep, cardio,
                  water, and optional supplement guidance included.
                </p>
              ) : null}
              <ul className={styles.bulletList}>
                {(PLAN_BULLETS[plan.slug] ?? []).map((item) => (
                  <li key={item}>
                    <Check size={15} aria-hidden /> {item}
                  </li>
                ))}
              </ul>
              <Link href={`/checkout?plan=${plan.slug}`} className={styles.planCta}>
                {plan.slug === 'digital_complete' ? 'Get Complete Plan' : 'Get plan'}
              </Link>
            </motion.article>
          ))}
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <p className={styles.sectionEyebrow}>How it works</p>
        <h2 className={styles.sectionTitle}>Your plan in 3 steps</h2>
        <ol className={styles.steps}>
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
              <strong>Open your plan setup</strong>
              <p>Verify email, then complete a short in app questionnaire.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Receive your plan</strong>
              <p>Your coach made plan is delivered to the app and email, usually within a few hours.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <p className={styles.sectionEyebrow}>FAQ</p>
        <h2 className={styles.sectionTitle}>Got questions?</h2>
        <div className={styles.faqList}>
          {FAQS.map((item, index) => {
            const open = openFaq === index
            return (
              <div key={item.q} className={styles.faqItem}>
                <button
                  type="button"
                  className={styles.faqButton}
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : index)}
                >
                  {item.q}
                  <span aria-hidden>{open ? '−' : '+'}</span>
                </button>
                {open ? <p className={styles.faqAnswer}>{item.a}</p> : null}
              </div>
            )
          })}
        </div>
      </section>

      <footer className={styles.footer}>
        <p className={styles.wordmark}>{BRAND_NAME}</p>
        <p>Customised digital plans · Made by the coach · Not live coaching</p>
        <p>
          Want live checkins with a coach?{' '}
          <a href="https://www.lurvox.in/" rel="noreferrer">
            Visit lurvox.in coaching
          </a>
        </p>
      </footer>

      <div className={`${styles.stickyBar} ${showSticky ? styles.stickyBarVisible : ''}`}>
        <div className={styles.stickyInner}>
          <div>
            <strong>Complete Plan</strong>
            <span className={styles.stickyMeta}>₹99 · one time</span>
          </div>
          <Link href={COMPLETE_HREF} className={styles.stickyCta}>
            <span className={styles.ctaFull}>Get Complete Plan · ₹99</span>
            <span className={styles.ctaShort}>Get Complete · ₹99</span>
          </Link>
        </div>
      </div>
    </main>
  )
}
