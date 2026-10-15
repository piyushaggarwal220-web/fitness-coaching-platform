import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'
import type { IconName } from './icons'

export type StudioPlan = {
  slug: CoachingPlanSlug
  badge: string
  pitch: string
  duration: string
  points: string[]
  checks?: string[]
  cta: string
  icon: IconName
  photo: string
  featured?: boolean
}

function rupees(paise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

export function monthlyLabel(slug: CoachingPlanSlug) {
  const plan = COACHING_PLANS[slug]
  const perMonth = Math.round(plan.amountPaise / 100 / plan.durationMonths)
  return `₹${perMonth.toLocaleString('en-IN')} a month`
}

export const PLANS: StudioPlan[] = [
  {
    slug: '3_months',
    badge: 'Great start',
    pitch: 'Lose fat fast with a plan built around your body.',
    duration: '3 months',
    icon: 'flame',
    photo: '/images/lurvox/studio/hero-2.webp',
    points: ['Rewritten every 14 days', 'Home or gym', 'Check-in mid-week and weekly'],
    cta: 'Start my fat loss plan',
  },
  {
    slug: '6_months',
    badge: 'Most chosen upgrade',
    pitch: 'Burn fat and build lean muscle simultaneously.',
    duration: '6 months',
    icon: 'muscle',
    photo: '/images/lurvox/studio/hero-3.webp',
    points: ['Rewritten every week', 'Cardio and a supplement plan', 'Extra help if you stall after 90 days'],
    cta: 'Start my 6-month plan',
  },
  {
    slug: '12_months',
    badge: 'Most popular · best value',
    pitch:
      'The complete transformation: fat loss, muscle gain, stamina, and testosterone optimization — built for a full year of change.',
    duration: '12 months',
    icon: 'bolt',
    photo: '/images/lurvox/studio/hero.webp',
    points: ['Everything in the 6-month plan', 'Stamina work, rewritten every week'],
    checks: ['Fat loss', 'Muscle gain', 'Stamina', 'Testosterone support for men, hourglass figure for women'],
    cta: 'Start my athletic plan',
    featured: true,
  },
]

export function planPrice(slug: CoachingPlanSlug) {
  return COACHING_PLANS[slug].displayPrice
}

export function planAmount(slug: CoachingPlanSlug) {
  return rupees(COACHING_PLANS[slug].amountPaise)
}

export function planName(slug: CoachingPlanSlug) {
  return COACHING_PLANS[slug].name
}

export const SHARED: { title: string; text: string; icon: IconName }[] = [
  { title: 'Diet', text: 'Meals from food you already eat.', icon: 'plate' },
  { title: 'Workout', text: 'Gym, home, or both.', icon: 'dumbbell' },
  { title: 'Check-ins', text: 'You report the week. The coach answers.', icon: 'chat' },
  { title: 'Tracker', text: 'Log food and training in the app.', icon: 'graph' },
  { title: 'Videos', text: 'A library for the movements in your plan.', icon: 'play' },
  { title: 'Cardio + supplements', text: 'On the 6-month and 12-month plans.', icon: 'bottle' },
]

export type StoryFrame = {
  title: string
  text: string
  image: string
  alt: string
  n?: string
  second?: { image: string; alt: string }
  caption?: string
}

export const STEPS: StoryFrame[] = [
  {
    n: '01',
    title: 'Pay, then answer',
    text: '25 questions and your photos.',
    image: '/images/lurvox/studio/step-answer.webp',
    alt: 'An athlete answering on a phone',
  },
  {
    n: '02',
    title: 'A coach writes it',
    text: 'Workout and diet within 3 hours.',
    image: '/landing/coach-piyush-dark.webp',
    alt: 'Piyush Aggarwal',
    second: { image: '/landing/coach-rakshit-dark.webp', alt: 'Rakshit Mohla' },
    caption: 'Piyush Aggarwal and Rakshit Mohla write the plans.',
  },
  {
    n: '03',
    title: 'You follow it',
    text: 'Train, eat, and log it in the app.',
    image: '/images/lurvox/studio/step-follow.webp',
    alt: 'An athlete training with dumbbells',
  },
  {
    n: '04',
    title: 'It gets rewritten',
    text: 'The next week follows the check-in.',
    image: '/images/lurvox/studio/step-rewrite.webp',
    alt: 'An athlete holding a phone after training',
  },
]

export const INCLUDED: StoryFrame[] = [
  {
    title: 'Diet',
    text: 'Meals from food you already eat.',
    image: '/images/lurvox/studio/inc-food.webp',
    alt: 'Eggs, roti, dal, rice, curd, and paneer on a white table',
  },
  {
    title: 'Workout',
    text: 'Written for a gym, home, or both.',
    image: '/images/lurvox/studio/move-squat.webp',
    alt: 'An athlete in a squat',
  },
  {
    title: 'Check-ins',
    text: 'You report the week. The coach answers.',
    image: '/landing/coach-rakshit-dark.webp',
    alt: 'Rakshit Mohla',
  },
  {
    title: 'Cardio and supplements',
    text: 'On the 6-month and 12-month plans.',
    image: '/images/lurvox/studio/inc-cardio.webp',
    alt: 'An athlete jumping rope',
  },
]

export const STATS: { icon: IconName; to: number; prefix?: string; suffix?: string; label: string; giant?: boolean }[] = [
  { icon: 'clock', to: 3, suffix: ' hours', label: 'A coach writes the plan', giant: true },
  { icon: 'card', to: 599, prefix: '₹', label: 'Starting price, 3 months' },
  { icon: 'chat', to: 25, label: 'Questions after you pay' },
  { icon: 'calendar', to: 3, label: 'Plans, from 3 months to a year' },
]

export const CLIPS = [
  { title: 'Squat', src: '/images/lurvox/studio/move-squat.webp', fallback: '/images/lurvox/studio/hero-3.webp' },
  { title: 'Row', src: '/images/lurvox/studio/move-row.webp', fallback: '/images/lurvox/studio/hero.webp' },
  { title: 'Press', src: '/images/lurvox/studio/move-press.webp', fallback: '/images/lurvox/studio/hero-2.webp' },
  { title: 'Lunge', src: '/images/lurvox/studio/move-hinge.webp', fallback: '/images/lurvox/studio/hero-3.webp' },
]

export const DAY_MEALS = ['Eggs and roti', 'Dal, rice, curd', 'Paneer and salad']
export const DAY_SETS = ['Squat · 3×8', 'Bench press · 3×8', 'Row · 3×10']

export const QUOTES = [
  {
    quote: 'We looked fat. No confidence. No support.',
    name: 'Piyush Aggarwal',
    role: 'Founder',
    photo: '/landing/coach-piyush-dark.webp',
  },
  {
    quote: 'We learned on our own, the hard way, so you don’t have to.',
    name: 'Rakshit Mohla',
    role: 'Founder',
    photo: '/landing/coach-rakshit-dark.webp',
  },
]

export type FinderPlan = 'fat' | 'mix' | 'athletic'
export type TrainWhere = 'home' | 'gym' | 'both'

const FINDER_ORDER: FinderPlan[] = ['fat', 'mix', 'athletic']

const FINDER_SLUG: Record<FinderPlan, CoachingPlanSlug> = {
  fat: '3_months',
  mix: '6_months',
  athletic: '12_months',
}

/** One line per scored question, written so two of them can sit in one sentence. */
const FINDER_CLUES: Record<number, Record<FinderPlan, string>> = {
  0: {
    fat: 'The goal is fast fat loss',
    mix: 'The goal is fat loss and visible muscle',
    athletic: 'The goal is a complete overhaul',
  },
  1: {
    fat: 'The commitment is about 3 months',
    mix: 'The commitment is half a year',
    athletic: 'The commitment is a full year',
  },
  2: {
    fat: 'Structured training is new',
    mix: 'Training has been on and off',
    athletic: 'Training is already regular',
  },
  3: {
    fat: 'Fat loss is the only job',
    mix: 'Muscle and strength matter too',
    athletic: 'Muscle, stamina, and performance all matter',
  },
  4: {
    fat: 'Stamina is not a priority',
    mix: 'Stamina matters somewhat',
    athletic: 'Stamina is high on the list',
  },
  5: {
    fat: 'The realistic start is the smaller plan',
    mix: 'The realistic start is the mid-range plan',
    athletic: 'The full year is realistic',
  },
  6: {
    fat: 'Success is the fat gone',
    mix: 'Success is fat gone and muscle on',
    athletic: 'Success is feeling like an athletic person',
  },
}

export const FINDER_QUESTIONS: {
  prompt: string
  options: { label: string; plan?: FinderPlan; where?: TrainWhere }[]
}[] = [
  {
    prompt: 'What is the main goal?',
    options: [
      { label: 'Fast fat loss', plan: 'fat' },
      { label: 'Fat loss and visible muscle', plan: 'mix' },
      { label: 'A complete overhaul: fat, muscle, stamina, and strength', plan: 'athletic' },
    ],
  },
  {
    prompt: 'How long can you commit?',
    options: [
      { label: 'About 3 months', plan: 'fat' },
      { label: 'Half a year', plan: 'mix' },
      { label: 'A full year', plan: 'athletic' },
    ],
  },
  {
    prompt: 'Where is your training now?',
    options: [
      { label: 'New to structured training', plan: 'fat' },
      { label: 'Trained on and off', plan: 'mix' },
      { label: 'I train fairly regularly', plan: 'athletic' },
    ],
  },
  {
    prompt: 'Beyond fat loss, what else?',
    options: [
      { label: 'Nothing else. Fat loss is the job.', plan: 'fat' },
      { label: 'Noticeable muscle and strength', plan: 'mix' },
      { label: 'Muscle, stamina, and performance', plan: 'athletic' },
    ],
  },
  {
    prompt: 'How much does stamina matter?',
    options: [
      { label: 'Not a priority', plan: 'fat' },
      { label: 'Somewhat', plan: 'mix' },
      { label: 'Very. I want to feel athletic.', plan: 'athletic' },
    ],
  },
  {
    prompt: 'What is realistic for your schedule and budget?',
    options: [
      { label: 'Start small', plan: 'fat' },
      { label: 'A mid-range plan', plan: 'mix' },
      { label: 'I am ready for the full year', plan: 'athletic' },
    ],
  },
  {
    prompt: 'A year from now, success looks like…',
    options: [
      { label: 'The fat is gone', plan: 'fat' },
      { label: 'The fat is gone and muscle is on', plan: 'mix' },
      { label: 'I feel like a different, athletic person', plan: 'athletic' },
    ],
  },
  {
    prompt: 'Where will you train?',
    options: [
      { label: 'Home', where: 'home' },
      { label: 'A gym', where: 'gym' },
      { label: 'Home and a gym', where: 'both' },
    ],
  },
]

function placePhrase(where: TrainWhere) {
  if (where === 'home') return 'training at home'
  if (where === 'gym') return 'training in a gym'
  return 'training at home and in a gym'
}

/** Highest score wins. A tie goes to the commitment answer (question 2) when that plan is tied, otherwise to the tied plan nearest that answer. */
export function recommendFromFinder(picks: FinderPlan[], where: TrainWhere): { slug: CoachingPlanSlug; reason: string } {
  const scores: Record<FinderPlan, number> = { fat: 0, mix: 0, athletic: 0 }
  for (const pick of picks) scores[pick] += 1
  const max = Math.max(scores.fat, scores.mix, scores.athletic)
  const leaders = FINDER_ORDER.filter((key) => scores[key] === max)
  const commitment = picks[1]
  let winner = leaders[0]
  if (leaders.length > 1) {
    if (leaders.includes(commitment)) {
      winner = commitment
    } else {
      const at = FINDER_ORDER.indexOf(commitment)
      winner = leaders
        .slice()
        .sort((a, b) => Math.abs(FINDER_ORDER.indexOf(a) - at) - Math.abs(FINDER_ORDER.indexOf(b) - at))[0]
    }
  }
  const clues = picks
    .map((pick, index) => (pick === winner ? FINDER_CLUES[index][winner] : null))
    .filter((line): line is string => Boolean(line))
  const first = clues[0] ?? 'This plan is the one the answers landed on'
  const second = clues[1] ? `, and ${clues[1].charAt(0).toLowerCase()}${clues[1].slice(1)}` : ''
  return {
    slug: FINDER_SLUG[winner],
    reason: `${first}${second}, with ${placePhrase(where)}.`,
  }
}

export const FAQS = [
  { q: 'What if I don’t see results?', a: 'The next week is rewritten from your check-in.' },
  { q: 'Can I switch plans?', a: 'You choose 3, 6, or 12 months when you pay, and longer plans add cardio and supplements.' },
  { q: 'Do I need gym access?', a: 'No. The workout is written for home, a gym, or both.' },
  { q: 'How does the tracker work?', a: 'You log food and training in the app, and the coach uses those logs.' },
  { q: 'What happens after I pay?', a: 'You answer 25 questions and send photos. The coach writes the plan within 3 hours.' },
]
