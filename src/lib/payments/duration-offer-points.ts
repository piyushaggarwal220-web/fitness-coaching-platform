/** What both preview lengths include. Same groups on preview 4, 5, 6, and their checkout. */
export const DURATION_OFFER_GROUPS = [
  { label: 'Your plan', points: ['Diet chart', 'Diet plan', 'Workout plan'] },
  { label: 'Guidance', points: ['Sleep guidance', 'Cardio guidance', 'Supplement guidance'] },
  { label: 'Support', points: ['Check-in', 'Coach chat'] },
  { label: 'Trackers', points: ['Diet tracker', 'Workout tracker'] },
] as const

export const DURATION_OFFER_POINTS = DURATION_OFFER_GROUPS.flatMap((group) => [...group.points])

export const DURATION_OFFER_RECEIVE =
  'Both lengths include a diet chart, a diet plan, a workout plan, sleep guidance, cardio guidance, supplement guidance, check-in, coach chat, a diet tracker, and a workout tracker. 3 months also includes a testosterone protocol for men and hourglass for women.'

export const DURATION_OFFER_EXTRA =
  '3 months adds a testosterone protocol for men and hourglass for women.'

export type DurationOfferCardPoint = {
  text: string
  note?: string
  gold?: boolean
}

/** Preview 4 and preview 5 plan cards. Same words on both. */
export const DURATION_STARTER_CARD_POINTS: DurationOfferCardPoint[] = [
  { text: 'Diet, workout, sleep, and cardio' },
  { text: 'Wednesday and Sunday check-ins', note: 'Twice a week, on the platform' },
  { text: 'Coach chat' },
  { text: 'Diet tracker' },
  { text: 'Workout tracker' },
]

export const DURATION_FINISHER_CARD_POINTS: DurationOfferCardPoint[] = [
  { text: 'Everything in the starter' },
  { text: 'Testosterone boosting protocol', note: 'Free for men', gold: true },
  { text: 'Hourglass figure', note: 'For women', gold: true },
]

export function durationOfferCardPoints(durationMonths: number): DurationOfferCardPoint[] {
  return durationMonths === 1 ? DURATION_STARTER_CARD_POINTS : DURATION_FINISHER_CARD_POINTS
}

export function durationOfferCardTitle(durationMonths: number) {
  return durationMonths === 1 ? 'The starter' : 'The finisher'
}

export function durationOfferCardTag(durationMonths: number) {
  return durationMonths === 1 ? '' : 'Best value'
}

export function durationOfferCardPriceNote(amountPaise: number, durationMonths: number) {
  if (durationMonths === 1) return 'for 1 month'
  return `for 3 months · ₹${Math.round(amountPaise / 100 / durationMonths)} a month`
}
