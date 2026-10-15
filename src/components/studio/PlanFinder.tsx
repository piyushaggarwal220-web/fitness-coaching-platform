'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { trackFunnelStep } from '@/lib/analytics/funnel'
import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'
import {
  FINDER_QUESTIONS,
  PLANS,
  planName,
  planPrice,
  recommendFromFinder,
  type FinderPlan,
  type TrainWhere,
} from './content'

const ease = [0.16, 1, 0.3, 1] as const

export function PlanFinder({
  onStart,
  onSeeAll,
}: {
  onStart: (slug: CoachingPlanSlug, event: MouseEvent<HTMLButtonElement>) => void
  onSeeAll: (slug: CoachingPlanSlug) => void
}) {
  const reduce = useReducedMotion()
  const lock = useRef(false)
  const started = useRef(false)
  const reported = useRef<string | null>(null)
  const [step, setStep] = useState(0)
  const [picks, setPicks] = useState<FinderPlan[]>([])
  const [where, setWhere] = useState<TrainWhere | null>(null)
  const question = FINDER_QUESTIONS[step]
  const result = step >= FINDER_QUESTIONS.length && where && picks.length === 7 ? recommendFromFinder(picks, where) : null
  const plan = result ? PLANS.find((item) => item.slug === result.slug) : null

  useEffect(() => {
    lock.current = false
  }, [step])

  function again() {
    setPicks([])
    setWhere(null)
    setStep(0)
  }

  useEffect(() => {
    if (!result) {
      reported.current = null
      return
    }
    if (reported.current === result.slug) return
    reported.current = result.slug
    trackFunnelStep('quiz_complete', {
      plan: result.slug,
      plan_name: planName(result.slug),
      value: COACHING_PLANS[result.slug].amountPaise / 100,
      currency: 'INR',
      source: 'preview1',
    })
  }, [result])

  function choose(option: (typeof FINDER_QUESTIONS)[number]['options'][number]) {
    if (lock.current) return
    lock.current = true
    if (!started.current) {
      started.current = true
      trackFunnelStep('quiz_start', { source: 'preview1' })
    }
    if (option.where) {
      setWhere(option.where)
      setStep(FINDER_QUESTIONS.length)
      return
    }
    if (!option.plan) return
    setPicks((current) => {
      const next = current.slice()
      next[step] = option.plan as FinderPlan
      return next
    })
    setStep((current) => current + 1)
  }

  return (
    <section className="st-quiz" id="quiz" aria-labelledby="quiz-title">
      <p className="st-kicker">Which plan</p>
      <h2 id="quiz-title">Eight questions. Then a plan.</h2>
      <p className="st-lede">This is free, and the answers stay on this page. It recommends a plan from what you pick. The longer onboarding form and photos come after you pay.</p>
      <div className="st-quiz-card">
        <div className="st-quiz-meter" aria-hidden="true">
          {FINDER_QUESTIONS.map((item, index) => (
            <i key={item.prompt} className={index < step ? 'is-on' : index === step ? 'is-now' : ''} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          {question ? (
            <motion.div
              key={question.prompt}
              initial={reduce ? false : { opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -24 }}
              transition={{ duration: 0.32, ease }}
            >
              <p className="st-quiz-count">Question {step + 1} of {FINDER_QUESTIONS.length}</p>
              <p className="st-quiz-q">{question.prompt}</p>
              <div className="st-quiz-options">
                {question.options.map((option) => {
                  const selected = option.plan ? picks[step] === option.plan : where === option.where
                  return (
                    <button key={option.label} type="button" className={selected ? 'is-on' : ''} onClick={() => choose(option)}>
                      {option.label}
                    </button>
                  )
                })}
              </div>
              {step > 0 ? (
                <button type="button" className="st-text-btn" onClick={() => setStep((current) => current - 1)}>
                  Back
                </button>
              ) : null}
            </motion.div>
          ) : result && plan ? (
            <motion.div
              key="result"
              className="st-quiz-result"
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22 }}
            >
              <motion.span
                className="st-quiz-mark"
                aria-hidden="true"
                initial={reduce ? false : { scale: 0.4, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 16, delay: 0.05 }}
              />
              <p className="st-quiz-count">{plan.duration}</p>
              <p className="st-quiz-plan">
                <strong>{planName(result.slug)}</strong>
                <span>{planPrice(result.slug)}</span>
              </p>
              <p>{result.reason}</p>
              <p>{plan.duration} · {planPrice(result.slug)} paid once.</p>
              <ul>
                {plan.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <div className="st-quiz-actions">
                <button type="button" className="st-btn st-btn-solid" onClick={(event) => onStart(result.slug, event)}>
                  {plan.cta} — {planPrice(result.slug)}
                </button>
                <button type="button" className="st-text-btn" onClick={() => onSeeAll(result.slug)}>
                  See all 3 plans
                </button>
                <button type="button" className="st-text-btn" onClick={again}>
                  Take it again
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  )
}
