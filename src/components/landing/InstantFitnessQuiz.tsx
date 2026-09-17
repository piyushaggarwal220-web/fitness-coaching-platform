'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Flame, Sparkles } from 'lucide-react'
import styles from './InstantFitnessQuiz.module.css'

type Option = { id: string; label: string; correct?: boolean }

type Question = {
  id: string
  prompt: string
  hint?: string
  options: Option[]
}

/** Tough fitness knowledge quiz — not a plan-finder. */
const QUESTIONS: Question[] = [
  {
    id: 'deficit',
    prompt: 'What actually drives fat loss over weeks?',
    hint: 'Think physics, not trends.',
    options: [
      { id: 'sweat', label: 'Sweating more in the gym' },
      { id: 'deficit', label: 'Eating fewer calories than you burn', correct: true },
      { id: 'detox', label: 'Detox teas and cutting carbs only at night' },
      { id: 'spot', label: 'Only doing ab exercises' },
    ],
  },
  {
    id: 'protein',
    prompt: 'Roughly how much protein do most active adults need daily?',
    hint: 'Per kg of body weight.',
    options: [
      { id: 'low', label: '0.3–0.5 g per kg' },
      { id: 'mid', label: '1.6–2.2 g per kg when training', correct: true },
      { id: 'huge', label: '5 g per kg no matter what' },
      { id: 'zero', label: 'Protein only matters for bodybuilders' },
    ],
  },
  {
    id: 'weights',
    prompt: 'For building muscle, what matters most?',
    options: [
      { id: 'light', label: 'Only light weights and endless reps' },
      { id: 'progressive', label: 'Progressive overload with enough protein and recovery', correct: true },
      { id: 'daily', label: 'Training the same muscle hard every single day' },
      { id: 'cardio', label: 'Cardio alone is enough for muscle' },
    ],
  },
  {
    id: 'rest',
    prompt: 'Between hard sets for muscle growth, rest is usually…',
    options: [
      { id: 'none', label: 'No rest — keep the heart rate maxed' },
      { id: 'short', label: 'About 1.5–3 minutes for most compound lifts', correct: true },
      { id: 'hour', label: 'At least 15 minutes every set' },
      { id: 'walk', label: 'Only walking between sets works' },
    ],
  },
  {
    id: 'cardio',
    prompt: 'Does cardio “kill gains”?',
    options: [
      { id: 'always', label: 'Yes — never do cardio if you lift' },
      { id: 'myth', label: 'No — smart cardio supports fat loss and heart health', correct: true },
      { id: 'onlyfasted', label: 'Only fasted cardio burns fat' },
      { id: 'hour', label: 'You need 2 hours of cardio daily' },
    ],
  },
  {
    id: 'sleep',
    prompt: 'How does sleep affect fat loss and muscle?',
    options: [
      { id: 'none', label: 'Sleep does not matter if diet is perfect' },
      { id: 'huge', label: 'Poor sleep raises hunger hormones and slows recovery', correct: true },
      { id: 'nap', label: 'Only naps matter, night sleep is optional' },
      { id: 'four', label: '4 hours is the optimal fat-loss sleep' },
    ],
  },
  {
    id: 'scale',
    prompt: 'The scale went up after a salty restaurant meal. What is most likely?',
    options: [
      { id: 'fat', label: 'You gained 1–2 kg of pure fat overnight' },
      { id: 'water', label: 'Water retention and food weight — not overnight fat', correct: true },
      { id: 'muscle', label: 'You built muscle in one dinner' },
      { id: 'fail', label: 'The whole plan failed permanently' },
    ],
  },
  {
    id: 'steps',
    prompt: 'Daily steps / NEAT mainly helps because…',
    options: [
      { id: 'magic', label: 'Steps burn “special” fat only from the belly' },
      { id: 'burn', label: 'They raise total daily calorie burn without crushing recovery', correct: true },
      { id: 'useless', label: 'Steps do nothing if you lift weights' },
      { id: 'replace', label: '10k steps replace the need for strength training' },
    ],
  },
  {
    id: 'meal',
    prompt: 'Is meal timing more important than total calories and protein?',
    options: [
      { id: 'timing', label: 'Yes — you must eat every 2 hours or fat loss stops' },
      { id: 'totals', label: 'No — daily totals matter far more than perfect timing', correct: true },
      { id: 'night', label: 'Never eat after 7 pm or you store fat' },
      { id: 'fast', label: 'Intermittent fasting is the only way that works' },
    ],
  },
  {
    id: 'plateau',
    prompt: 'Progress stalls for 3 weeks. Best first move?',
    options: [
      { id: 'crash', label: 'Cut calories in half overnight' },
      { id: 'check', label: 'Check adherence, steps, sleep, then adjust calories or training', correct: true },
      { id: 'quit', label: 'Quit and start a random new program tomorrow' },
      { id: 'supps', label: 'Buy more fat burners first' },
    ],
  },
]

const ACCENTS = [
  styles.accentRed,
  styles.accentOrange,
  styles.accentYellow,
  styles.accentGreen,
  styles.accentTeal,
  styles.accentBlue,
  styles.accentPurple,
  styles.accentPink,
  styles.accentLime,
  styles.accentGold,
]

export function InstantFitnessQuiz() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null)

  const question = QUESTIONS[step]
  const progress = useMemo(
    () => Math.round(((done ? QUESTIONS.length : step) / QUESTIONS.length) * 100),
    [done, step]
  )

  const score = useMemo(() => {
    let correct = 0
    for (const q of QUESTIONS) {
      const opt = q.options.find((o) => o.id === answers[q.id])
      if (opt?.correct) correct += 1
    }
    return correct
  }, [answers])

  const accent = ACCENTS[step % ACCENTS.length]

  function selectOption(optionId: string) {
    if (!question || flash) return
    const opt = question.options.find((o) => o.id === optionId)
    setFlash(opt?.correct ? 'correct' : 'wrong')
    const next = { ...answers, [question.id]: optionId }
    setAnswers(next)
    window.setTimeout(() => {
      setFlash(null)
      if (step >= QUESTIONS.length - 1) {
        setDone(true)
        return
      }
      setStep((s) => s + 1)
    }, 420)
  }

  function restart() {
    setStep(0)
    setAnswers({})
    setDone(false)
    setFlash(null)
  }

  const strong = score >= 7
  const mid = score >= 4 && score < 7

  return (
    <section className={styles.wrap} aria-labelledby="fitness-quiz-title">
      <div className={styles.heroBanner}>
        <p className={styles.eyebrow}>
          <Flame size={14} aria-hidden /> Fitness knowledge check
        </p>
        <h2 id="fitness-quiz-title" className={styles.title}>
          Think you know fitness?
        </h2>
        <p className={styles.lede}>
          10 real questions. No fluff. See where you stand — then get a plan built around you so you
          do not have to memorise all of this.
        </p>
      </div>

      <div className={styles.progressTrack} aria-hidden>
        <div className={`${styles.progressFill} ${accent}`} style={{ width: `${progress}%` }} />
      </div>
      <p className={styles.progressLabel}>
        {done ? `Score ${score} / ${QUESTIONS.length}` : `Question ${step + 1} of ${QUESTIONS.length}`}
      </p>

      {!done && question ? (
        <div
          className={`${styles.card} ${accent} ${flash === 'correct' ? styles.cardCorrect : ''} ${flash === 'wrong' ? styles.cardWrong : ''}`}
        >
          <div className={styles.cardGlow} aria-hidden />
          <p className={styles.qBadge}>Q{step + 1}</p>
          <h3 className={styles.prompt}>{question.prompt}</h3>
          {question.hint ? <p className={styles.hint}>{question.hint}</p> : null}
          <div className={styles.options}>
            {question.options.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                className={`${styles.option} ${
                  i % 4 === 0
                    ? styles.optTone1
                    : i % 4 === 1
                      ? styles.optTone2
                      : i % 4 === 2
                        ? styles.optTone3
                        : styles.optTone4
                }`}
                disabled={Boolean(flash)}
                onClick={() => selectOption(opt.id)}
              >
                <span className={styles.optIndex}>{String.fromCharCode(65 + i)}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
          {step > 0 && !flash ? (
            <button type="button" className={styles.back} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : null}
        </div>
      ) : null}

      {done ? (
        <div className={styles.result}>
          <div className={styles.resultGlow} aria-hidden />
          <p className={styles.resultEyebrow}>
            <Sparkles size={14} aria-hidden /> Your score · {score}/{QUESTIONS.length}
          </p>
          <h3 className={styles.resultTitle}>
            {strong
              ? 'Strong knowledge. Still skip the guesswork.'
              : mid
                ? 'Decent base. A written plan beats random tips.'
                : 'You do not need to learn all this alone.'}
          </h3>
          <p className={styles.resultBlurb}>
            {strong
              ? 'You already know a lot. We still build workout + diet around your body, schedule, and food — so you execute instead of researching.'
              : 'Most people fail on generic tips and gym myths. We take care of the science: personal diet, workout, sleep, and cardio guidance after a short questionnaire.'}
          </p>
          <ul className={styles.resultPoints}>
            <li>
              <Check size={15} aria-hidden /> You do not need to memorise every rule
            </li>
            <li>
              <Check size={15} aria-hidden /> Coach-made plan from your answers
            </li>
            <li>
              <Check size={15} aria-hidden /> Delivered to app + email in a few hours
            </li>
            <li>
              <Check size={15} aria-hidden /> Complete Guidance ₹99 · moneyback if no results
            </li>
          </ul>
          <div className={styles.resultActions}>
            <Link href="/checkout?plan=digital_complete" className={styles.primaryCta}>
              Get Complete Guidance · ₹99
            </Link>
            <a href="#plans" className={styles.secondaryCta}>
              See all plans
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
