'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, Dumbbell, MessageCircle, Send, Smartphone, UserRound, X } from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { coaches } from '@/lib/content'
import { DIGITAL_PLAN_LIST } from '@/lib/payments/plans'
import { AnimatedTransformations } from '@/components/landing/AnimatedTransformations'
import { InstantFitnessQuiz } from '@/components/landing/InstantFitnessQuiz'
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
  ],
}

const COMPLETE_FREEBIES = [
  'Supplement guidance',
  'Cardio guidance',
  'Sleep guidance',
  'Water intake guidance',
] as const

function InstagramMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
    </svg>
  )
}


const FAIL_POINTS = [
  'Generic AI plans copy the same template for everyone',
  'Old beliefs like “more sweat means more fat loss”',
  'Random YouTube workouts with no weekly structure',
  'Crash diets that crash your energy and adherence',
  'Ignoring sleep, water, and recovery',
  'Changing plans every week before results can show',
]

const WIN_POINTS = [
  'Customised plans built from your answers and coach principles',
  'Science first: calories, protein, progressive overload, recovery',
  'Clear weekly workout structure with sets and reps',
  'Diet chart matched to your goal and food reality',
  'Sleep, cardio, water, and supplement guidance free with Complete',
  'Simple rules you can follow for weeks, not one hard day',
]

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
  {
    q: 'What if I see no results?',
    a: 'We stand behind guaranteed results with moneyback if you see none, when you follow the plan as written.',
  },
]

type ChatMsg = { role: 'bot' | 'user'; text: string }

export default function CustomisedPlanLandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [showSticky, setShowSticky] = useState(false)
  const [botOpen, setBotOpen] = useState(false)
  const [botInput, setBotInput] = useState('')
  const [botBusy, setBotBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'bot',
      text: 'Hi. Ask me about plans, delivery, moneyback, or Complete vs Workout/Diet.',
    },
  ])
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 320)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, botBusy, botOpen])

  useEffect(() => {
    if (!botOpen) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(id)
  }, [botOpen])

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape' && botOpen) setBotOpen(false)
  })

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  const suggestions = useMemo(
    () => ['How fast do I get the plan?', 'Why ₹99 Complete?', 'Moneyback?', 'Workout or Complete?'],
    []
  )

  async function sendBot(text: string) {
    const trimmed = text.trim()
    if (!trimmed || botBusy) return
    const history = messages.slice(-6).map((m) => ({
      role: m.role === 'bot' ? ('assistant' as const) : ('user' as const),
      content: m.text,
    }))
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setBotInput('')
    setBotBusy(true)
    try {
      const res = await fetch('/api/marketing/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history, surface: 'instant' }),
      })
      const data = (await res.json().catch(() => ({}))) as { reply?: string }
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text:
            data.reply?.trim() ||
            'Workout ₹49 · Diet ₹89 · Complete ₹99. After pay, finish the short questionnaire for delivery.',
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: 'Could not reach help right now. Scroll to FAQ, or pick Complete ₹99 below.',
        },
      ])
    } finally {
      setBotBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.ticker} aria-hidden>
        <div className={styles.tickerTrack}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i}>One time payment · Guaranteed results · Coach made plans · </span>
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
            Coach-made plans around your goals, from ₹49. Delivered to email and the app within a few
            hours. Written guidance — not live coaching. Tracker, Journey, and Coach chat are optional
            add-ons if you want them later.
          </p>
          <div className={styles.stampRow}>
            <div className={styles.guaranteeStamp} aria-label="Guaranteed results, moneyback if none">
              <span className={styles.stampRing}>
                <span className={styles.stampTop}>Guaranteed</span>
                <span className={styles.stampMid}>Results</span>
                <span className={styles.stampBottom}>Moneyback</span>
              </span>
            </div>
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
          <div className={styles.heroPortraits}>
            {coaches.map((coach) => (
              <figure key={coach.instagramHandle} className={styles.heroPortrait}>
                <div className={styles.heroPhotoFrame}>
                  <Image
                    src={coach.photo}
                    alt={`${coach.name}, Lurvox coach`}
                    fill
                    priority
                    sizes="(max-width: 900px) 48vw, 360px"
                    className={styles.heroImage}
                  />
                </div>
                <figcaption className={styles.heroCaption}>
                  <span className={styles.heroName}>{coach.firstName}</span>
                  <a
                    href={coach.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.heroInstagram}
                  >
                    <InstagramMark />
                    {coach.instagramHandle}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className={styles.photoHeadline}>
            <p className={styles.photoHeadlineMain}>Transformed over 7000 people</p>
            <p className={styles.photoHeadlineSub}>Guaranteed results · moneyback if none</p>
          </div>
        </motion.div>
      </section>

      <section className={styles.truthSection} aria-labelledby="truth-title">
        <p className={styles.sectionEyebrow}>Truth check</p>
        <h2 id="truth-title" className={styles.sectionTitle}>
          Why we give results, but you fail
        </h2>
        <p className={styles.sectionLede}>
          Most people fail on generic templates and gym myths. We build customised plans on science
          and coach principles.
        </p>

        <div className={styles.truthGrid}>
          <article className={styles.failCard}>
            <p className={styles.truthCardLabel}>Why people fail</p>
            <ul>
              {FAIL_POINTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className={styles.winCard}>
            <p className={styles.truthCardLabel}>Why our plans work</p>
            <ul>
              {WIN_POINTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
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
              <p className={styles.planPrice}>
                {plan.displayPrice}
                {plan.slug === 'digital_complete' ? (
                  <span className={styles.planWas} title="Workout ₹49 + Diet ₹89 if bought separately">
                    ₹138
                  </span>
                ) : null}
              </p>
              <p className={styles.planMeta}>
                {plan.slug === 'digital_complete'
                  ? 'Workout ₹49 · Diet ₹89 · both only ₹99'
                  : plan.saveLabel}
              </p>
              {plan.slug === 'digital_complete' ? (
                <p className={styles.planValueNote}>
                  ₹138 if bought separately. Complete is ₹99 — and these extras come free.
                </p>
              ) : null}
              <ul className={styles.bulletList}>
                {(PLAN_BULLETS[plan.slug] ?? []).map((item) => (
                  <li key={item}>
                    <Check size={15} aria-hidden /> {item}
                  </li>
                ))}
              </ul>
              {plan.slug === 'digital_complete' ? (
                <div className={styles.freebies}>
                  <p className={styles.freebiesTitle}>
                    <span className={styles.freeBadge}>FREE</span>
                    Included at no extra cost
                  </p>
                  <ul className={styles.freebiesList}>
                    {COMPLETE_FREEBIES.map((item) => (
                      <li key={item}>
                        <span className={styles.freeChip}>FREE</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Link href={`/checkout?plan=${plan.slug}`} className={styles.planCta}>
                {plan.slug === 'digital_complete' ? 'Get Complete Plan' : 'Get plan'}
              </Link>
            </motion.article>
          ))}
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <AnimatedTransformations variant="instant" />
      </section>

      <section className={styles.section} id="find-plan">
        <InstantFitnessQuiz />
      </section>

      <section className={styles.section}>
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
            <span className={styles.stickyMeta}>₹99 · 4 free extras · moneyback</span>
          </div>
          <Link href={COMPLETE_HREF} className={styles.stickyCta}>
            <span className={styles.ctaFull}>Get Complete Plan · ₹99</span>
            <span className={styles.ctaShort}>Get Complete · ₹99</span>
          </Link>
        </div>
      </div>

      <button
        type="button"
        className={`${styles.botFab} ${botOpen ? styles.botFabOpen : ''}`}
        aria-expanded={botOpen}
        aria-controls="plan-help-bot"
        onClick={() => setBotOpen((v) => !v)}
      >
        {botOpen ? <X size={20} aria-hidden /> : <MessageCircle size={20} aria-hidden />}
        <span>{botOpen ? 'Close' : 'Ask'}</span>
      </button>

      {botOpen ? (
        <motion.div
          id="plan-help-bot"
          className={styles.botPanel}
          role="dialog"
          aria-label="Plan help"
          aria-modal="false"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.botHeader}>
            <div className={styles.botIdentity}>
              <span className={styles.botAvatar} aria-hidden>
                L
              </span>
              <div>
                <strong>Plan help</strong>
                <span className={styles.botStatus}>
                  <span className={styles.botStatusDot} aria-hidden />
                  {botBusy ? 'Typing…' : 'Usually replies in seconds'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className={styles.botClose}
              aria-label="Close chat"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setBotOpen(false)
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
              }}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className={styles.botMessages} ref={messagesRef}>
            {messages.map((msg, i) => (
              <p
                key={`${msg.role}-${i}`}
                className={msg.role === 'bot' ? styles.botBubble : styles.userBubble}
              >
                {msg.text}
              </p>
            ))}
            {botBusy ? (
              <p className={`${styles.botBubble} ${styles.botTyping}`} aria-live="polite">
                <span />
                <span />
                <span />
              </p>
            ) : null}
          </div>
          <div className={styles.botSuggestions}>
            {suggestions.map((item) => (
              <button key={item} type="button" disabled={botBusy} onClick={() => void sendBot(item)}>
                {item}
              </button>
            ))}
          </div>
          <form
            className={styles.botForm}
            onSubmit={(e) => {
              e.preventDefault()
              void sendBot(botInput)
            }}
          >
            <input
              ref={inputRef}
              value={botInput}
              onChange={(e) => setBotInput(e.target.value)}
              placeholder="Ask about plans, delivery, moneyback…"
              aria-label="Your question"
              disabled={botBusy}
              maxLength={500}
            />
            <button type="submit" disabled={botBusy || !botInput.trim()} aria-label="Send">
              <Send size={16} aria-hidden />
            </button>
          </form>
        </motion.div>
      ) : null}
    </main>
  )
}
