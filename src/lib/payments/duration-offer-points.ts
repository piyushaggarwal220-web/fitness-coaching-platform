/** What both preview lengths include. Same groups on preview 4, 5, 6, and their checkout. */
export const DURATION_OFFER_GROUPS = [
  { label: 'Your plan', points: ['Diet chart', 'Diet plan', 'Workout plan'] },
  { label: 'Guidance', points: ['Sleep guidance', 'Cardio guidance', 'Supplement guidance'] },
  { label: 'Support', points: ['Check-in', 'Coach chat'] },
  { label: 'Trackers', points: ['Diet tracker', 'Workout tracker'] },
] as const

export const DURATION_OFFER_POINTS = DURATION_OFFER_GROUPS.flatMap((group) => [...group.points])

export const DURATION_OFFER_RECEIVE =
  'Both lengths include a diet chart, a diet plan, a workout plan, sleep guidance, cardio guidance, supplement guidance, check-in, coach chat, a diet tracker, and a workout tracker.'
