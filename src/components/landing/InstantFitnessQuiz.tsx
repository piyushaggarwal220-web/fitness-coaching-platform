'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import styles from './InstantFitnessQuiz.module.css'

type Option = { id: string; label: string; score: { workout: number; diet: number; complete: number } }

type Question = {
  id: string
  prompt: string
  options: Option[]
}

const QUESTIONS: Question[] = [
  {
    id: 'goal',
    prompt: 'What is your main goal right now?',
    options: [
      { id: 'fat', label: 'Lose fat', score: { workout: 1, diet: 2, complete: 3 } },
      { id: 'muscle', label: 'Build muscle', score: { workout: 2, diet: 1, complete: 3 } },
      { id: 'both', label: 'Lose fat and build muscle', score: { workout: 2, diet: 2, complete: 3 } },
      { id: 'fit', label: 'Get fitter / healthier', score: { workout: 1, diet: 1, complete: 3 } },
    ],
  },
  {
    id: 'sex',
    prompt: 'Which best describes you?',
    options: [
      { id: 'm', label: 'Male', score: { workout: 1, diet: 1, complete: 1 } },
      { id: 'f', label: 'Female', score: { workout: 1, diet: 1, complete: 1 } },
      { id: 'o', label: 'Prefer not to say', score: { workout: 1, diet: 1, complete: 1 } },
    ],
  },
  {
    id: 'age',
    prompt: 'Your age range?',
    options: [
      { id: 'u25', label: 'Under 25', score: { workout: 1, diet: 1, complete: 1 } },
      { id: '25_35', label: '25–35', score: { workout: 1, diet: 1, complete: 1 } },
      { id: '36_45', label: '36–45', score: { workout: 1, diet: 1, complete: 2 } },
      { id: '45p', label: '45+', score: { workout: 1, diet: 1, complete: 2 } },
    ],
  },
  {
    id: 'experience',
    prompt: 'Training experience?',
    options: [
      { id: 'beginner', label: 'Beginner — just starting', score: { workout: 2, diet: 1, complete: 3 } },
      { id: 'some', label: 'Some experience — on and off', score: { workout: 2, diet: 1, complete: 2 } },
      { id: 'regular', label: 'Train regularly already', score: { workout: 2, diet: 1, complete: 2 } },
    ],
  },
  {
    id: 'place',
    prompt: 'Where will you train?',
    options: [
      { id: 'gym', label: 'Gym', score: { workout: 3, diet: 0, complete: 2 } },
      { id: 'home', label: 'Home', score: { workout: 3, diet: 0, complete: 2 } },
      { id: 'both', label: 'Mix of gym and home', score: { workout: 3, diet: 0, complete: 2 } },
    ],
  },
  {
    id: 'days',
    prompt: 'How many days can you train per week?',
    options: [
      { id: '2_3', label: '2–3 days', score: { workout: 2, diet: 0, complete: 2 } },
      { id: '4_5', label: '4–5 days', score: { workout: 3, diet: 0, complete: 2 } },
      { id: '6p', label: '6+ days', score: { workout: 3, diet: 0, complete: 2 } },
    ],
  },
  {
    id: 'diet',
    prompt: 'How important is a diet chart for you?',
    options: [
      { id: 'critical', label: 'Critical — food is my biggest gap', score: { workout: 0, diet: 3, complete: 3 } },
      { id: 'helpful', label: 'Helpful — I want clear meals', score: { workout: 0, diet: 2, complete: 3 } },
      { id: 'light', label: 'Light — I mostly need workouts', score: { workout: 2, diet: 0, complete: 1 } },
    ],
  },
  {
    id: 'food',
    prompt: 'Your usual food style?',
    options: [
      { id: 'veg', label: 'Vegetarian', score: { workout: 0, diet: 2, complete: 2 } },
      { id: 'egget', label: 'Eggetarian', score: { workout: 0, diet: 2, complete: 2 } },
      { id: 'nonveg', label: 'Non-vegetarian', score: { workout: 0, diet: 2, complete: 2 } },
      { id: 'vegan', label: 'Vegan', score: { workout: 0, diet: 2, complete: 2 } },
    ],
  },
  {
    id: 'sleep',
    prompt: 'Do you also want sleep, water, and cardio guidance?',
    options: [
      { id: 'yes', label: 'Yes — I want the full setup', score: { workout: 0, diet: 0, complete: 4 } },
      { id: 'maybe', label: 'Maybe — if it is included', score: { workout: 1, diet: 1, complete: 2 } },
      { id: 'no', label: 'No — just training or diet is enough', score: { workout: 1, diet: 1, complete: 0 } },
    ],
  },
  {
    id: 'speed',
    prompt: 'When do you want to start?',
    options: [
      { id: 'now', label: 'Today — I am ready', score: { workout: 1, diet: 1, complete: 2 } },
      { id: 'week', label: 'This week', score: { workout: 1, diet: 1, complete: 1 } },
      { id: 'soon', label: 'Soon — just exploring', score: { workout: 1, diet: 1, complete: 1 } },
    ],
  },
]

type ResultSlug = 'digital_workout' | 'digital_diet' | 'digital_complete'

const RESULT_COPY: Record<
  ResultSlug,
  { title: string; price: string; blurb: string; href: string }
> = {
  digital_complete: {
    title: 'Complete Guidance',
    price: '₹99',
    blurb: 'Workout + diet + sleep, cardio, water, and optional supplements — best match for your answers.',
    href: '/checkout?plan=digital_complete',
  },
  digital_diet: {
    title: 'Diet Plan',
    price: '₹89',
    blurb: 'A customised diet chart is the highest-leverage next step from your answers.',
    href: '/checkout?plan=digital_diet',
  },
  digital_workout: {
    title: 'Workout Plan',
    price: '₹49',
    blurb: 'A structured workout plan matches what you need most right now.',
    href: '/checkout?plan=digital_workout',
  },
}

function pickResult(answers: Record<string, string>): ResultSlug {
  const totals = { workout: 0, diet: 0, complete: 0 }
  for (const q of QUESTIONS) {
    const optId = answers[q.id]
    const opt = q.options.find((o) => o.id === optId)
    if (!opt) continue
    totals.workout += opt.score.workout
    totals.diet += opt.score.diet
    totals.complete += opt.score.complete
  }
  if (totals.complete >= totals.workout && totals.complete >= totals.diet) return 'digital_complete'
  if (totals.diet > totals.workout) return 'digital_diet'
  return 'digital_workout'
}

export function InstantFitnessQuiz() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)

  const question = QUESTIONS[step]
  const progress = useMemo(() => Math.round(((done ? QUESTIONS.length : step) / QUESTIONS.length) * 100), [done, step])
  const result = done ? RESULT_COPY[pickResult(answers)] : null

  function selectOption(optionId: string) {
    if (!question) return
    const next = { ...answers, [question.id]: optionId }
    setAnswers(next)
    if (step >= QUESTIONS.length - 1) {
      setDone(true)
      return
    }
    setStep((s) => s + 1)
  }

  function restart() {
    setStep(0)
    setAnswers({})
    setDone(false)
  }

  return (
    <section className={styles.wrap} aria-labelledby="instant-quiz-title">
      <p className={styles.eyebrow}>Quick fitness check</p>
      <h2 id="instant-quiz-title" className={styles.title}>
        Find your Instant Plan
      </h2>
      <p className={styles.lede}>
        10 short questions. Stay on this page — we recommend the Instant Plan that fits you. No coaching
        membership upsell.
      </p>

      <div className={styles.progressTrack} aria-hidden>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>
      <p className={styles.progressLabel}>
        {done ? 'Done' : `Question ${step + 1} of ${QUESTIONS.length}`}
      </p>

      {!done && question ? (
        <div className={styles.card}>
          <h3 className={styles.prompt}>{question.prompt}</h3>
          <div className={styles.options}>
            {question.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={styles.option}
                onClick={() => selectOption(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {step > 0 ? (
            <button type="button" className={styles.back} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : null}
        </div>
      ) : null}

      {done && result ? (
        <div className={styles.result}>
          <p className={styles.resultEyebrow}>Your Instant Plan match</p>
          <h3 className={styles.resultTitle}>{result.title}</h3>
          <p className={styles.resultPrice}>{result.price}</p>
          <p className={styles.resultBlurb}>{result.blurb}</p>
          <ul className={styles.resultPoints}>
            <li>
              <Check size={15} aria-hidden /> Built from your answers after checkout
            </li>
            <li>
              <Check size={15} aria-hidden /> Delivered to app + email in a few hours
            </li>
            <li>
              <Check size={15} aria-hidden /> One-time payment · moneyback if no results
            </li>
          </ul>
          <div className={styles.resultActions}>
            <Link href={result.href} className={styles.primaryCta}>
              Get {result.title} · {result.price}
            </Link>
            <a href="#plans" className={styles.secondaryCta}>
              See all Instant Plans
            </a>
            <button type="button" className={styles.restart} onClick={restart}>
              Retake quiz
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
