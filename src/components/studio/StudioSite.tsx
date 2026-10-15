'use client'

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Lenis from 'lenis'
import { CheckoutSheet } from './CheckoutSheet'
import { LogoMark, Mark } from './icons'
import { PhoneMock } from './PhoneMock'
import { IncludeGrid, StepList } from './PhotoStory'
import { PlanFinder } from './PlanFinder'
import { ClipRow, HeroFilm, TrendChart } from './visuals'
import {
  FAQS,
  INCLUDED,
  PLANS,
  QUOTES,
  STATS,
  STEPS,
  monthlyLabel,
  planPrice,
  type StudioPlan,
} from './content'
import type { CoachingPlanSlug } from '@/lib/payments/plans'

const ease = [0.16, 1, 0.3, 1] as const

function Count({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const [value, setValue] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) {
      setValue(to)
      return
    }
    let frame = 0
    let started = false
    const run = () => {
      if (started) return
      started = true
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 900)
        setValue(Math.round((1 - Math.pow(1 - t, 3)) * to))
        if (t < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) run()
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [reduce, to])
  return (
    <span ref={ref}>
      {prefix}
      {value.toLocaleString('en-IN')}
      {suffix}
    </span>
  )
}

function MagnetButton({
  className,
  children,
  onClick,
}: {
  className?: string
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button
      ref={ref}
      type="button"
      className={className}
      onClick={onClick}
      onMouseMove={(event) => {
        const el = ref.current
        if (!el || window.matchMedia('(pointer: coarse)').matches) return
        const box = el.getBoundingClientRect()
        const x = (event.clientX - box.left - box.width / 2) * 0.16
        const y = (event.clientY - box.top - box.height / 2) * 0.22
        el.style.transform = `translate(${x}px, ${y}px)`
      }}
      onMouseLeave={() => {
        if (ref.current) ref.current.style.transform = ''
      }}
    >
      {children}
    </button>
  )
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease }}
    >
      {children}
    </motion.div>
  )
}

function SpinLine({ lines, start = 0, hot = false }: { lines: string[]; start?: number; hot?: boolean }) {
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(start % lines.length)
  useEffect(() => {
    if (reduce) return
    const id = window.setInterval(() => setIndex((current) => (current + 1) % lines.length), 3400)
    return () => window.clearInterval(id)
  }, [lines.length, reduce])
  const line = lines[index] ?? lines[0]
  return (
    <p className={`st-spin${hot ? ' is-hot' : ''}`} aria-hidden="true">
      <AnimatePresence mode="wait">
        <motion.span
          key={line}
          initial={reduce ? false : { y: '110%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={reduce ? undefined : { y: '-110%', opacity: 0 }}
          transition={{ duration: 0.45, ease }}
        >
          {line}
        </motion.span>
      </AnimatePresence>
    </p>
  )
}

export function StudioSite() {
  const reduce = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const [intro, setIntro] = useState(false)
  const [pastHero, setPastHero] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)
  const [checkout, setCheckout] = useState<StudioPlan | null>(null)
  const [cursor, setCursor] = useState({ x: -40, y: -40 })
  const [progress, setProgress] = useState(0)
  const [pick, setPick] = useState<CoachingPlanSlug | null>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const heroRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!window.sessionStorage.getItem('lurvox-studio-seen')) {
      setIntro(true)
      const id = window.setTimeout(() => {
        setIntro(false)
        window.sessionStorage.setItem('lurvox-studio-seen', '1')
      }, 900)
      return () => window.clearTimeout(id)
    }
  }, [])

  useEffect(() => {
    if (reduce) return
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true })
    lenisRef.current = lenis
    let frame = 0
    const loop = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [reduce])

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? window.scrollY / max : 0)
      setScrolled(window.scrollY > 12)
      const hero = heroRef.current
      setPastHero(hero ? hero.getBoundingClientRect().bottom < 80 : window.scrollY > 520)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function go(id: string) {
    setMenu(false)
    const el = document.getElementById(id)
    if (!el) return
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -72 })
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  function moveCursor(event: MouseEvent) {
    if (window.matchMedia('(pointer: coarse)').matches) return
    setCursor({ x: event.clientX, y: event.clientY })
  }

  function openPlan(plan: StudioPlan, event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const burst = document.createElement('span')
    burst.className = 'st-burst'
    burst.style.left = `${rect.left + rect.width / 2}px`
    burst.style.top = `${rect.top + rect.height / 2}px`
    document.body.appendChild(burst)
    window.setTimeout(() => burst.remove(), 500)
    window.setTimeout(() => setCheckout(plan), 160)
  }

  const headline = 'Your athletic body starts today.'

  return (
    <div className="st-root" onMouseMove={moveCursor}>
      <div className="st-progress" style={{ transform: `scaleX(${progress})` }} />
      <div className="st-cursor" style={{ left: cursor.x, top: cursor.y }} />
      {intro ? (
        <div className="st-intro" aria-hidden="true">
          <LogoMark size={48} />
        </div>
      ) : null}

      <header className={`st-nav${scrolled ? ' is-on' : ''}`}>
        <a className="st-logo" href="#top" onClick={(e) => { e.preventDefault(); go('top') }}>
          <LogoMark />
          LURVOX
        </a>
        <nav>
          <button type="button" onClick={() => go('plans')}>Plans</button>
          <button type="button" onClick={() => go('how')}>How it works</button>
          <button type="button" onClick={() => go('results')}>Results</button>
          <button type="button" onClick={() => go('faq')}>FAQ</button>
        </nav>
        <button type="button" className="st-btn st-btn-solid st-nav-cta" onClick={() => go('plans')}>Get started</button>
        <button type="button" className="st-menu-btn" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu((v) => !v)}>
          <i /><i />
        </button>
      </header>

      {menu ? (
        <div className="st-menu">
          {['plans', 'how', 'quiz', 'results', 'faq'].map((id, i) => (
            <motion.button
              key={id}
              type="button"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => go(id)}
            >
              {id === 'how' ? 'How it works' : id === 'quiz' ? 'Take the quiz' : id === 'faq' ? 'FAQ' : id[0].toUpperCase() + id.slice(1)}
            </motion.button>
          ))}
        </div>
      ) : null}

      <main id="top">
        <section className="st-hero" ref={heroRef}>
          <div className="st-blob" aria-hidden="true" />
          <div className="st-hero-copy">
            <p className="st-kicker">Online fitness coaching</p>
            <h1>
              {headline.split(' ').map((word, wi) => (
                <span key={word} className="st-word">
                  {word.split('').map((char, i) => (
                    <motion.span
                      key={`${word}-${i}`}
                      className="st-h1-char"
                      initial={reduce ? false : { opacity: 0, y: 18, filter: 'blur(8px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{ delay: 0.04 + (wi * 8 + i) * 0.015, duration: 0.4, ease }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </span>
              ))}
            </h1>
            <p className="st-lede">One workout. One diet. Rewritten from your check-ins.</p>
            <div className="st-hero-actions">
              <MagnetButton className="st-btn st-btn-solid" onClick={() => go('plans')}>See the plans</MagnetButton>
              <MagnetButton className="st-btn st-btn-ghost" onClick={() => go('quiz')}>Take the quiz</MagnetButton>
            </div>
            <p className="st-note">A coach writes the plan within 3 hours of payment. From ₹599.</p>
          </div>
          <HeroFilm />
        </section>

        <SpinLine hot lines={['A coach writes it within 3 hours.', 'One workout. One diet.', 'From ₹599.']} />

        <section className="st-stats" aria-label="The offer">
          {STATS.map((stat) => (
            <div key={stat.label} className={stat.giant ? 'is-giant' : ''}>
              <Mark name={stat.icon} />
              <strong><Count to={stat.to} prefix={stat.prefix} suffix={stat.suffix} /></strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </section>

        <SpinLine start={1} lines={['25 questions after you pay.', 'Home, gym, or both.', 'The next week follows the check-in.']} />

        <section className="st-how" id="how">
          <Reveal>
            <p className="st-kicker">How LURVOX works</p>
            <h2>Four steps. Then it keeps moving.</h2>
          </Reveal>
          <StepList frames={STEPS} />
        </section>

        <SpinLine start={1} lines={['Pay. Answer. Train.', 'Written within 3 hours.', 'Rewritten from the check-in.']} />

        <section className="st-device" id="tracker">
          <div className="st-device-copy">
            <p className="st-kicker">In the app</p>
            <h2>Log the day. The coach reads it.</h2>
            <p className="st-lede">The tracker from the app, in miniature. Switch between diet and workout, then tap a row to mark it done.</p>
          </div>
          <PhoneMock />
        </section>

        <SpinLine hot lines={['Diet and the workout, in one app.', 'Mark the meal when it’s done.', 'The coach reads the log.']} />

        <section className="st-included" id="included">
          <Reveal>
            <p className="st-kicker">What’s included</p>
            <h2>The plan, and the things around it.</h2>
          </Reveal>
          <IncludeGrid frames={INCLUDED} />
        </section>

        <SpinLine start={2} lines={['Meals from food you already eat.', 'Cardio and supplements from 6 months.', 'A check-in, then an answer.']} />

        <ClipRow />

        <SpinLine hot start={1} lines={['Squat. Row. Press. Hinge.', 'The movements in your plan.', 'Train at home or in a gym.']} />

        <PlanFinder
          onStart={(slug, event) => {
            const plan = PLANS.find((item) => item.slug === slug)
            if (plan) openPlan(plan, event)
          }}
          onSeeAll={(slug) => {
            setPick(slug)
            go('plans')
          }}
        />

        <SpinLine lines={['Eight questions. Then a price.', 'The workout matches where you train.', 'Fat loss, muscle, or the full year.']} />

        <section className="st-pricing" id="plans">
          <Reveal>
            <p className="st-kicker">The plans</p>
            <h2>Pick how long the coach stays.</h2>
            <p className="st-lede">Workout, diet, check-ins, and chat are in every plan. A longer plan is rewritten more often.</p>
          </Reveal>
          <div className="st-plan-row">
            {PLANS.map((plan, index) => (
              <motion.article
                key={plan.slug}
                id={`plan-${plan.slug}`}
                className={`${plan.featured ? 'is-feature' : ''} ${pick === plan.slug ? 'is-pick' : ''}`}
                initial={reduce ? false : { y: 36, rotate: index === 1 ? 0 : index === 0 ? -2 : 2 }}
                whileInView={{ y: 0, rotate: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22, delay: index * 0.08 }}
                onMouseMove={(event) => {
                  const card = event.currentTarget
                  const box = card.getBoundingClientRect()
                  const px = (event.clientX - box.left) / box.width
                  const py = (event.clientY - box.top) / box.height
                  card.style.setProperty('--x', `${event.clientX - box.left}px`)
                  card.style.setProperty('--y', `${event.clientY - box.top}px`)
                  if (!window.matchMedia('(pointer: coarse)').matches) {
                    card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 8}deg) rotateY(${(px - 0.5) * 10}deg)`
                  }
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = ''
                }}
              >
                <span className="st-spot" />
                <div className="st-plan-photo">
                  <Image src={plan.photo} alt="" fill sizes="(min-width: 800px) 30vw, 100vw" />
                </div>
                <div className="st-plan-top">
                  <span className="st-badge">{plan.badge}</span>
                  {pick === plan.slug ? <span className="st-match">Your match</span> : null}
                </div>
                <div className="st-plan-head">
                  <h3>{plan.duration}</h3>
                  <p className="st-price">{planPrice(plan.slug)}</p>
                </div>
                <p className="st-month">{monthlyLabel(plan.slug)}</p>
                <p className="st-plan-pitch">{plan.pitch}</p>
                <ul>
                  {plan.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
                {plan.checks ? (
                  <p className="st-plan-chips">
                    {plan.checks.map((point) => <span key={point}>{point}</span>)}
                  </p>
                ) : null}
                <MagnetButton className="st-btn st-btn-solid" onClick={(event) => openPlan(plan, event)}>
                  {plan.cta} — {planPrice(plan.slug)}
                </MagnetButton>
              </motion.article>
            ))}
          </div>
          <p className="st-aside">Sales are final once payment is captured, except where the <a href="/refund-policy">Refund Policy</a> says otherwise.</p>
        </section>

        <SpinLine hot start={2} lines={['₹599 · ₹999 · ₹1,699.', 'A longer plan is rewritten more often.', 'The coach stays for the months you pick.']} />

        <section className="st-results" id="results">
          <div className="st-results-copy">
            <p className="st-kicker">Results</p>
            <h2>The week you had changes the next one.</h2>
            <ul>
              <li><Mark name="dumbbell" /><span>You train on the days you have, with the equipment you have.</span></li>
              <li><Mark name="plate" /><span>You eat food you already cook.</span></li>
              <li><Mark name="trend" /><span>You check in, and the next week changes.</span></li>
            </ul>
            <p className="st-aside">Each point on the line is a week: the plan, your check-in, then the rewrite.</p>
          </div>
          <TrendChart />
        </section>

        <SpinLine lines={['You check in. Next week changes.', 'Food you already cook.', 'Days and equipment you actually have.']} />

        <section className="st-promise" aria-label="What the coaching delivers">
          <p className="st-kicker">What you get</p>
          <p className="st-promise-line">A workout and a diet written for your week, then rewritten after you check in.</p>
        </section>

        <SpinLine hot lines={['Written for your week.', 'Then rewritten after you check in.', 'One workout. One diet.']} />

        <section className="st-founders" aria-label="From the founders">
          {QUOTES.map((item) => (
            <figure key={item.name}>
              <Image src={item.photo} alt="" width={64} height={64} />
              <blockquote>“{item.quote}”</blockquote>
              <figcaption>{item.name}, {item.role}</figcaption>
            </figure>
          ))}
        </section>

        <SpinLine start={1} lines={['Piyush Aggarwal and Rakshit Mohla.', 'We learned it the hard way.', 'So the plan is written for you.']} />

        <section className="st-faq" id="faq">
          <Reveal>
            <p className="st-kicker">Questions</p>
            <h2>Before you pay.</h2>
          </Reveal>
          <div>
            {FAQS.map((item, i) => {
              const open = openFaq === i
              return (
                <article key={item.q}>
                  <button type="button" aria-expanded={open} onClick={() => setOpenFaq(open ? -1 : i)}>
                    {item.q}
                    <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>+</motion.span>
                  </button>
                  <motion.div
                    initial={false}
                    animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
                    transition={{ duration: reduce ? 0 : 0.28, ease }}
                    style={{ overflow: 'hidden' }}
                  >
                    <p>{item.a}</p>
                  </motion.div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="st-close st-bleed">
          <Image src="/images/lurvox/studio/hero-2.webp" alt="" fill sizes="100vw" />
          <div>
            <h2>The plan can be in your phone within 3 hours.</h2>
            <p>Pay, answer, send the photos. A coach writes that week.</p>
            <MagnetButton className="st-btn st-btn-solid" onClick={() => go('plans')}>Choose a plan</MagnetButton>
          </div>
        </section>
      </main>

      <footer className="st-foot">
        <LogoMark />
        <strong>LURVOX</strong>
        <p>Online fitness coaching</p>
        <p>14, Sector 44, Golf Course Road, Gurugram, Haryana 122003</p>
        <p>
          <a href="mailto:hello@lurvox.in">hello@lurvox.in</a>
          <a href="/login">Client login</a>
          <a href="/terms">Terms</a>
          <a href="/refund-policy">Refund policy</a>
        </p>
        <p className="st-pay">Payments processed by Razorpay.</p>
      </footer>

      <div className={`st-dock${pastHero ? ' is-on' : ''}`}>
        <button type="button" onClick={() => go('plans')}>View plans · from ₹599</button>
      </div>

      <CheckoutSheet plan={checkout} onClose={() => setCheckout(null)} />
    </div>
  )
}
