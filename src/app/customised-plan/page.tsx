'use client'

import { startTransition, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Apple,
  Check,
  ChevronRight,
  Clock,
  Dumbbell,
  Lock,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { CHECKOUT_TRANSFORMATIONS } from '@/lib/checkout-transformations'
import { DIGITAL_PLANS } from '@/lib/payments/plans'
import { resolveMarketingBaseUrl } from '@/lib/admin/portal-urls'
import styles from './customised-plan.module.css'

const COMPLETE_HREF = '/checkout?plan=digital_complete'
const WORKOUT_HREF = '/checkout?plan=digital_workout'
const DIET_HREF = '/checkout?plan=digital_diet'
const COACHING_HREF = `${resolveMarketingBaseUrl().replace(/\/$/, '')}/`

const COMPLETE_FEATURES = [
  'Personalized workout plan',
  'Personalized diet plan',
  'Calorie guidance',
  'Protein guidance',
  'Exercise structure',
  'Sets and reps',
  'Training schedule',
  'Food structure',
  'Lifestyle guidance',
  'Sleep guidance',
  'Water guidance',
  'Cardio guidance',
]

const FAIL_CARDS = [
  {
    title: 'Generic workouts',
    copy: 'Same routine for everyone.',
  },
  {
    title: 'Random diets',
    copy: 'No clear calorie or nutrition structure.',
  },
  {
    title: 'No personalization',
    copy: 'Ignores lifestyle and preferences.',
  },
  {
    title: 'No progression',
    copy: 'No clear path to improve week to week.',
  },
  {
    title: 'Low adherence',
    copy: 'A plan that does not fit your life is hard to follow.',
  },
]

const WHO_FOR = [
  'You want a structured fitness plan',
  'You are tired of random workouts',
  'You do not know how much you should eat',
  'You want a plan around your schedule',
  'You want personalized guidance without expensive 1-to-1 coaching',
  'You are a beginner or intermediate trainee',
  'You want a clear system to follow',
]

const FAQS = [
  {
    q: 'Is the plan personalized?',
    a: 'Yes. After payment you complete a short setup questionnaire. Your plan is built around your body, goals, lifestyle, preferences, experience, and requirements.',
  },
  {
    q: 'How does personalization work?',
    a: 'Your answers feed LURVOX coaching methodology. Training, nutrition targets, and lifestyle guidance are shaped from what you tell us — not a one-size template.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Usually within a few hours after you finish setup. Your plan appears in the app under My Plan, and we email you a link.',
  },
  {
    q: 'Is this a subscription?',
    a: 'No. One-time payment. No recurring subscription.',
  },
  {
    q: 'Do I need a gym?',
    a: 'No. During setup you tell us where you train — gym, home, or both — and your plan follows that.',
  },
  {
    q: 'Can beginners use it?',
    a: 'Yes. Experience level is part of setup, so structure and intensity can match beginners and intermediates.',
  },
  {
    q: 'Can I choose my food preferences?',
    a: 'Yes. Food preferences and lifestyle constraints are collected during setup and used in your nutrition plan.',
  },
  {
    q: 'Can I use this for fat loss?',
    a: 'Yes. Fat loss is a supported goal. Your training and calorie targets follow the goal you select.',
  },
  {
    q: 'Can I use this for muscle gain?',
    a: 'Yes. Muscle gain and recomposition are supported goals in setup.',
  },
  {
    q: 'Is this live coaching?',
    a: 'No. This is personalized digital planning — not daily WhatsApp coaching, live calls, or weekly human check-ins.',
  },
  {
    q: 'What happens after I pay?',
    a: 'You complete plan setup, we prepare your personalized plan using LURVOX methodology, then you receive it in the app and by email within a few hours.',
  },
  {
    q: 'What does the money-back guarantee cover?',
    a: 'If you are not satisfied with the plan you receive, contact us within 7 days. This is a plan satisfaction guarantee, not a promise of a specific body result.',
  },
]

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-36px' },
  transition: { duration: 0.35 },
}

export default function CustomisedPlanLandingPage() {
  const reduceMotion = useReducedMotion()
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [showSticky, setShowSticky] = useState(false)
  const motionProps = reduceMotion ? {} : fadeUp

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 520
      startTransition(() => setShowSticky(next))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <p className={styles.wordmark}>{BRAND_NAME}</p>
        <a href="#pricing" className={styles.topLink}>
          See pricing
        </a>
      </header>

      <section className={styles.hero}>
        <motion.div
          className={styles.heroInner}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <h1 className={styles.heroTitle}>Your personalized fitness plan</h1>
          <p className={styles.eyebrow}>Coach-designed · Personalized for you</p>
          <p className={styles.heroPrice}>
            Workout + Diet — <span>{DIGITAL_PLANS.digital_complete.displayPrice}</span>
          </p>
          <p className={styles.heroSupport}>
            Built around your goal, body, lifestyle, training experience and preferences.
          </p>
          <ul className={styles.heroBenefits}>
            <li>
              <Check size={15} aria-hidden /> Personalized workout
            </li>
            <li>
              <Check size={15} aria-hidden /> Personalized diet
            </li>
            <li>
              <Check size={15} aria-hidden /> Built around your lifestyle
            </li>
            <li>
              <Check size={15} aria-hidden /> Delivered within a few hours
            </li>
          </ul>
          <p className={styles.heroTrust}>One-time payment · No subscription</p>
          <div className={styles.heroActions}>
            <Link href={COMPLETE_HREF} className={styles.primaryCta}>
              Build my plan <ChevronRight size={18} aria-hidden />
            </Link>
            <p className={styles.heroAlt}>Starting from {DIGITAL_PLANS.digital_workout.displayPrice}</p>
          </div>
          <div className={styles.heroPortraits}>
            <figure className={styles.heroPortrait}>
              <Image
                src="/landing/instant-coach-piyush.png"
                alt="Piyush, Lurvox coach"
                fill
                priority
                sizes="(max-width: 900px) 42vw, 200px"
                className={styles.heroImage}
              />
            </figure>
            <figure className={styles.heroPortrait}>
              <Image
                src="/landing/instant-coach-rakshit.png"
                alt="Rakshit, Lurvox coach"
                fill
                priority
                sizes="(max-width: 900px) 42vw, 200px"
                className={styles.heroImage}
              />
            </figure>
          </div>
          <p className={styles.coachLine}>Piyush and Rakshit · Lurvox coaches</p>
        </motion.div>
      </section>

      <section className={styles.sectionAlt}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Clarity</p>
          <h2 className={styles.sectionTitle}>Why most fitness plans don&apos;t work</h2>
          <p className={styles.sectionLede}>
            The problem isn&apos;t always effort. Sometimes the plan simply doesn&apos;t fit the
            person following it.
          </p>
        </motion.div>
        <div className={styles.failGrid}>
          {FAIL_CARDS.map((item) => (
            <article key={item.title} className={styles.failCard}>
              <X size={16} className={styles.failIcon} aria-hidden />
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Complete plan</p>
          <h2 className={styles.sectionTitle}>What you get</h2>
          <p className={styles.sectionLede}>
            Included in the {DIGITAL_PLANS.digital_complete.displayPrice} Workout + Diet plan.
          </p>
        </motion.div>
        <ul className={styles.featureGrid}>
          {COMPLETE_FEATURES.map((item) => (
            <li key={item}>
              <Check size={16} aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="pricing" className={styles.sectionAlt}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Pricing</p>
          <h2 className={styles.sectionTitle}>Choose your plan</h2>
          <p className={styles.sectionLede}>One-time payment. No subscription. No fake scarcity.</p>
        </motion.div>

        <div className={styles.priceGrid}>
          <article className={styles.priceCard}>
            <Dumbbell size={22} className={styles.priceIcon} aria-hidden />
            <h3>Personalized Workout</h3>
            <p className={styles.priceAmount}>{DIGITAL_PLANS.digital_workout.displayPrice}</p>
            <p className={styles.priceCopy}>Personalized workout plan</p>
            <Link href={WORKOUT_HREF} className={styles.secondaryCta}>
              Get workout <ChevronRight size={16} aria-hidden />
            </Link>
          </article>

          <article className={`${styles.priceCard} ${styles.priceCardHero}`}>
            <p className={styles.bestBadge}>Best value</p>
            <Sparkles size={22} className={styles.priceIcon} aria-hidden />
            <h3>Complete Plan</h3>
            <p className={styles.priceAmount}>{DIGITAL_PLANS.digital_complete.displayPrice}</p>
            <p className={styles.priceBundle}>Workout + Diet</p>
            <div className={styles.priceMath}>
              <p>
                {DIGITAL_PLANS.digital_workout.displayPrice} +{' '}
                {DIGITAL_PLANS.digital_diet.displayPrice} = <s>₹138</s>
              </p>
              <p className={styles.priceSave}>
                Get both for {DIGITAL_PLANS.digital_complete.displayPrice}
              </p>
              <p className={styles.savePill}>Save ₹39</p>
            </div>
            <Link href={COMPLETE_HREF} className={styles.primaryCta}>
              Get complete plan <ChevronRight size={16} aria-hidden />
            </Link>
          </article>

          <article className={styles.priceCard}>
            <Apple size={22} className={styles.priceIcon} aria-hidden />
            <h3>Personalized Diet</h3>
            <p className={styles.priceAmount}>{DIGITAL_PLANS.digital_diet.displayPrice}</p>
            <p className={styles.priceCopy}>Personalized diet plan</p>
            <Link href={DIET_HREF} className={styles.secondaryCta}>
              Get diet <ChevronRight size={16} aria-hidden />
            </Link>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Credibility</p>
          <h2 className={styles.sectionTitle}>7,000+ people trained &amp; inspired</h2>
          <p className={styles.sectionLede}>Real LURVOX client stories from our community.</p>
        </motion.div>
        <div className={styles.proofGrid}>
          {CHECKOUT_TRANSFORMATIONS.slice(0, 6).map((item) => (
            <article key={item.id} className={styles.proofCard}>
              <div className={styles.proofImageWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Shopify CDN; matches checkout */}
                <img
                  src={item.image}
                  alt={`${item.name} result`}
                  className={styles.proofImage}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <h3>{item.title}</h3>
              <p>&ldquo;{item.quote}&rdquo;</p>
              <span>
                {item.name} · {item.city}
              </span>
            </article>
          ))}
        </div>
        <Link href={COMPLETE_HREF} className={styles.primaryCta}>
          Build my plan <ChevronRight size={18} aria-hidden />
        </Link>
      </section>

      <section className={styles.sectionAlt}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Fit check</p>
          <h2 className={styles.sectionTitle}>Who is this for?</h2>
          <p className={styles.sectionLede}>This plan is ideal if:</p>
        </motion.div>
        <ul className={styles.whoList}>
          {WHO_FOR.map((item) => (
            <li key={item}>
              <Check size={16} aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Methodology</p>
          <h2 className={styles.sectionTitle}>Coach-designed. Personalized for you.</h2>
          <p className={styles.sectionLede}>
            LURVOX uses its coaching methodology to build a personalized plan around your individual
            information, goals and preferences.
          </p>
        </motion.div>
        <div className={styles.methodRow}>
          <div className={styles.methodChip}>
            <UserRound size={16} aria-hidden /> Methodology
          </div>
          <span aria-hidden>+</span>
          <div className={styles.methodChip}>
            <Sparkles size={16} aria-hidden /> Personalization
          </div>
          <span aria-hidden>+</span>
          <div className={styles.methodChip}>
            <Dumbbell size={16} aria-hidden /> Technology
          </div>
          <span aria-hidden>=</span>
          <div className={`${styles.methodChip} ${styles.methodChipAccent}`}>
            Affordable personalized planning
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Process</p>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <p className={styles.sectionLede}>Choose → Personalize → Build → Receive</p>
        </motion.div>
        <ol className={styles.steps}>
          <li>
            <span>01</span>
            <strong>Choose your plan</strong>
            <p>Select Workout, Diet, or Complete.</p>
          </li>
          <li>
            <span>02</span>
            <strong>Tell us about you</strong>
            <p>Complete your personalized plan setup.</p>
          </li>
          <li>
            <span>03</span>
            <strong>We build your plan</strong>
            <p>Your information is processed according to the LURVOX methodology.</p>
          </li>
          <li>
            <span>04</span>
            <strong>Receive your plan</strong>
            <p>Delivered within a few hours.</p>
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Delivery</p>
          <h2 className={styles.sectionTitle}>Your plan will be delivered within a few hours</h2>
        </motion.div>
        <ol className={styles.deliveryFlow}>
          <li>
            <Check size={16} aria-hidden /> Payment complete
          </li>
          <li aria-hidden className={styles.deliveryArrow}>
            ↓
          </li>
          <li>
            <Check size={16} aria-hidden /> Plan setup received
          </li>
          <li aria-hidden className={styles.deliveryArrow}>
            ↓
          </li>
          <li>
            <Clock size={16} aria-hidden /> Your plan is being prepared
          </li>
          <li aria-hidden className={styles.deliveryArrow}>
            ↓
          </li>
          <li>
            <Check size={16} aria-hidden /> Plan delivered
          </li>
        </ol>
      </section>

      <section className={styles.sectionAlt}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>Expectations</p>
          <h2 className={styles.sectionTitle}>Personalized planning. Not live coaching.</h2>
          <p className={styles.sectionLede}>
            This product provides personalized written fitness guidance.
          </p>
        </motion.div>
        <p className={styles.upsellCopy}>It does not include:</p>
        <ul className={styles.clearList}>
          <li>Daily WhatsApp coaching</li>
          <li>Live calls</li>
          <li>Ongoing human check-ins</li>
          <li>1-to-1 coaching</li>
        </ul>
        <p className={styles.upsellCopy}>Need personal coaching?</p>
        <a href={COACHING_HREF} className={styles.secondaryCta} rel="noreferrer">
          Explore LURVOX 1-to-1 coaching <ChevronRight size={16} aria-hidden />
        </a>
      </section>

      <section className={styles.section}>
        <motion.div className={styles.guaranteeBox} {...motionProps}>
          <ShieldCheck size={28} className={styles.guaranteeIcon} aria-hidden />
          <h2 className={styles.sectionTitle}>7-day money-back guarantee</h2>
          <p className={styles.sectionLede}>
            Try your personalized plan with confidence. If you are not satisfied with the plan you
            receive, contact us within 7 days.
          </p>
          <ul className={styles.trustRow}>
            <li>
              <ShieldCheck size={14} aria-hidden /> Money-back guarantee
            </li>
            <li>
              <Lock size={14} aria-hidden /> Secure payment
            </li>
            <li>
              <Check size={14} aria-hidden /> One-time payment
            </li>
            <li>
              <Check size={14} aria-hidden /> No subscription
            </li>
          </ul>
        </motion.div>
      </section>

      <section className={styles.sectionAlt}>
        <motion.div {...motionProps}>
          <p className={styles.sectionEyebrow}>FAQ</p>
          <h2 className={styles.sectionTitle}>Questions, answered</h2>
        </motion.div>
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

      <section className={styles.finalCta}>
        <h2>Stop guessing. Start following a plan.</h2>
        <p className={styles.finalLines}>
          Your goal.
          <br />
          Your lifestyle.
          <br />
          Your preferences.
          <br />
          Your personalized plan.
        </p>
        <p className={styles.heroPrice}>
          Workout + Diet — <span>{DIGITAL_PLANS.digital_complete.displayPrice}</span>
        </p>
        <p className={styles.heroTrust}>One-time payment · No subscription</p>
        <Link href={COMPLETE_HREF} className={styles.primaryCta}>
          Get my personalized plan <ChevronRight size={18} aria-hidden />
        </Link>
      </section>

      <footer className={styles.footer}>
        <p className={styles.wordmark}>{BRAND_NAME}</p>
        <p>Personalized digital plans · Coach-designed methodology · Not live coaching</p>
      </footer>

      <div
        className={`${styles.stickyBar} ${showSticky ? styles.stickyBarVisible : ''}`}
        aria-hidden={!showSticky}
      >
        <div className={styles.stickyInner}>
          <div>
            <strong>Personalized plan · ₹99</strong>
            <span>One-time · few hours delivery</span>
          </div>
          <Link href={COMPLETE_HREF} className={styles.stickyCta}>
            Get my plan
          </Link>
        </div>
      </div>
    </main>
  )
}
