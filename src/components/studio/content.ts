import { INSTANT_PLAN_WINDOW_LABEL } from '@/lib/plan-delivery-window'
import { FIRST_PLAN_TARGET } from '@/lib/payments/plan-pages'
import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'
import type { IconName } from './icons'

export type StudioPlan = {
  slug: CoachingPlanSlug
  badge: string
  pitch: string
  duration: string
  points: string[]
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
  return `₹${perMonth.toLocaleString('en-IN')} a month · paid once`
}

export { FIRST_PLAN_TARGET }

export const PLANS: StudioPlan[] = [
  {
    slug: '3_months',
    badge: '14-day rewrites',
    pitch: 'A fat-loss plan built around your body, food, and week.',
    duration: '3 months',
    icon: 'flame',
    photo: '/images/lurvox/studio/hero-2.webp',
    points: ['Rewritten every 14 days', 'Home or gym', 'Check-in mid-week and weekly'],
    cta: 'Start my fat loss plan',
  },
  {
    slug: '6_months',
    badge: 'Weekly rewrites',
    pitch: 'Workout and diet for fat loss and muscle, rewritten every week.',
    duration: '6 months',
    icon: 'muscle',
    photo: '/images/lurvox/studio/hero-3.webp',
    points: ['Rewritten every week', 'Cardio and a supplement plan', 'Extra help if you stall after 90 days'],
    cta: 'Start my 6-month plan',
  },
  {
    slug: '12_months',
    badge: 'Full year',
    pitch: 'A full year of workout, diet, stamina work, and weekly rewrites.',
    duration: '12 months',
    icon: 'bolt',
    photo: '/images/lurvox/studio/hero.webp',
    points: ['Everything in the 6-month plan', 'Stamina work, rewritten every week'],
    cta: 'Start my athletic plan',
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
  { title: 'Form clips', text: 'In the app when a movement in your plan has one.', icon: 'play' },
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
    text: 'The onboarding form and your photos.',
    image: '/images/lurvox/studio/step-answer.webp',
    alt: 'An athlete answering on a phone',
  },
  {
    n: '02',
    title: 'A coach writes it',
    text: `Workout and diet within ${INSTANT_PLAN_WINDOW_LABEL} of that.`,
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

export const STATS: { value: string; label: string }[] = [
  { value: INSTANT_PLAN_WINDOW_LABEL, label: 'First plan, after onboarding' },
  { value: COACHING_PLANS['3_months'].displayPrice, label: 'Starting price, paid once' },
  { value: '3 plans', label: '3, 6, or 12 months' },
  { value: 'Home or gym', label: 'Written for the equipment you have' },
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
      { label: 'Fat loss and visible muscle', plan: 'mix' },
      { label: 'A complete overhaul: fat, muscle, stamina, and strength', plan: 'athletic' },
      { label: 'Fast fat loss', plan: 'fat' },
    ],
  },
  {
    prompt: 'How long can you commit?',
    options: [
      { label: 'A full year', plan: 'athletic' },
      { label: 'About 3 months', plan: 'fat' },
      { label: 'Half a year', plan: 'mix' },
    ],
  },
  {
    prompt: 'Where is your training now?',
    options: [
      { label: 'Trained on and off', plan: 'mix' },
      { label: 'New to structured training', plan: 'fat' },
      { label: 'I train fairly regularly', plan: 'athletic' },
    ],
  },
  {
    prompt: 'Beyond fat loss, what else?',
    options: [
      { label: 'Muscle, stamina, and performance', plan: 'athletic' },
      { label: 'Noticeable muscle and strength', plan: 'mix' },
      { label: 'Nothing else. Fat loss is the job.', plan: 'fat' },
    ],
  },
  {
    prompt: 'How much does stamina matter?',
    options: [
      { label: 'Somewhat', plan: 'mix' },
      { label: 'Very. I want to feel athletic.', plan: 'athletic' },
      { label: 'Not a priority', plan: 'fat' },
    ],
  },
  {
    prompt: 'What is realistic for your schedule and budget?',
    options: [
      { label: 'I am ready for the full year', plan: 'athletic' },
      { label: 'A mid-range plan', plan: 'mix' },
      { label: 'Start small', plan: 'fat' },
    ],
  },
  {
    prompt: 'A year from now, success looks like…',
    options: [
      { label: 'I feel like a different, athletic person', plan: 'athletic' },
      { label: 'The fat is gone', plan: 'fat' },
      { label: 'The fat is gone and muscle is on', plan: 'mix' },
    ],
  },
  {
    prompt: 'Where will you train?',
    options: [
      { label: 'A gym', where: 'gym' },
      { label: 'Home and a gym', where: 'both' },
      { label: 'Home', where: 'home' },
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
  {
    q: 'What happens after I pay?',
    a: 'You create an account and complete the onboarding form: goals, schedule, equipment, food, and health notes. You also send progress photos. Nothing in that form is collected by this 8-question plan finder.',
  },
  {
    q: 'When is the plan written?',
    a: `${FIRST_PLAN_TARGET} Later check-ins can change the next plan. The Terms are the contract.`,
  },
  {
    q: 'Are progress photos required?',
    a: 'Onboarding asks for front, side, and back photos. They are required unless that form marks them optional. They are used to write the plan and are not published without separate consent. Refusing required photos can pause coaching. The Terms describe how submissions are handled.',
  },
  {
    q: 'Is this a monthly subscription?',
    a: 'No. You pay the full plan price once, for 3, 6, or 12 months. The monthly figure on each card is that price divided by the months, not a separate charge.',
  },
  {
    q: 'Can I switch plans?',
    a: 'You choose 3, 6, or 12 months when you pay. Longer plans add cardio and supplements, and they are rewritten every week instead of every 14 days. An upgrade within 48 hours of starting has no extra fee under the published rule. After that, the extra fee is ₹250. An upgrade can still be refused.',
  },
  {
    q: 'What is the refund policy?',
    a: 'Sales are final once payment is captured, except where the Refund Policy and Terms say otherwise. Those pages are the refund rules.',
  },
  {
    q: 'What if I have an injury or a medical condition?',
    a: 'This is fitness coaching, not medical care. Tell the onboarding form about injuries, pain, and medication, and get medical advice before you train.',
  },
  {
    q: 'Do I need gym access?',
    a: 'No. The workout is written for home, a gym, or both.',
  },
]
