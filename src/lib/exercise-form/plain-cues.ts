import { applyExerciseAliases } from '@/lib/exercise-form/normalize'

/**
 * One everyday sentence for a common exercise.
 * More specific patterns come first so "leg curl" is not treated as a biceps curl.
 */
const CUES: { test: RegExp; text: string }[] = [
  {
    test: /\b(romanian|stiff leg|rdl|hip hinge)\b/,
    text: 'Stand tall with the weight in front of your thighs. Soften your knees, push your hips back, then stand up again.',
  },
  {
    test: /\bgood morning\b/,
    text: 'Rest the weight on your shoulders. Push your hips back and lean forward a little, then stand tall. Keep a soft bend in your knees.',
  },
  {
    test: /\bdeadlift\b/,
    text: 'Stand close to the weight. Push the floor away and stand up tall. Keep the weight close to your legs.',
  },
  {
    test: /\bgoblet\b/,
    text: 'Hold the weight at your chest. Sit down between your feet, then stand back up.',
  },
  {
    test: /\b(split squat|bulgarian|lunge|step ups?)\b/,
    text: 'Step one foot forward. Lower your back knee toward the floor, then stand back up. Switch legs when the set says each leg.',
  },
  {
    test: /\bhip thrust\b/,
    text: 'Upper back on a bench, feet flat. Drive your hips up and squeeze your bum at the top, then lower.',
  },
  {
    test: /\bglute bridge\b/,
    text: 'Lie on your back with your feet flat. Lift your hips, squeeze your bum, then lower.',
  },
  {
    test: /\bleg press\b/,
    text: 'Sit in the machine with your feet on the plate. Push the plate away, then bend your knees to bring it back. Do not slam your knees straight.',
  },
  {
    test: /\bhack squat\b/,
    text: 'Back against the pad, feet on the plate. Bend your knees to sit down, then stand back up.',
  },
  {
    test: /\b(leg curl|hamstring curl)\b/,
    text: 'Curl your heels toward your bum, pause, then lower them slowly.',
  },
  {
    test: /\bleg extension\b/,
    text: 'Sit tall and straighten your knees, pause, then bend them again.',
  },
  {
    test: /\bcalf\b/,
    text: 'Rise onto the balls of your feet, pause, then lower your heels.',
  },
  {
    test: /\bshoulder taps?\b/,
    text: 'Hold a straight body like a plank. Tap one shoulder with the opposite hand, then the other. Keep your hips still.',
  },
  {
    test: /\b(push ups?|press ups?)\b/,
    text: 'Hands on the floor, body in a straight line. Bend your elbows to lower your chest, then press back up.',
  },
  {
    test: /\bincline\b.*\b(press|bench)\b|\b(press|bench)\b.*\bincline\b/,
    text: 'Lie on a bench that is tilted up. Lower the weight to your upper chest, then press it back up.',
  },
  {
    test: /\b(bench|chest press|floor press)\b/,
    text: 'Lie on your back. Lower the weight to your chest, then press it back up.',
  },
  {
    test: /\b(overhead|shoulder press|military)\b/,
    text: 'Start with the weight at your shoulders. Press it overhead, then lower it under control.',
  },
  {
    test: /\bdips?\b/,
    text: 'Support yourself on the bars or a bench. Bend your elbows to lower, then press back up.',
  },
  {
    test: /\b(pulldown|pull down|lat pull)\b/,
    text: 'Pull the bar or band down toward your upper chest, then let it rise slowly.',
  },
  {
    test: /\b(pull ups?|chin ups?)\b/,
    text: 'Hang from the bar. Pull your chin up to the bar, then lower yourself slowly.',
  },
  {
    test: /\bface pulls?\b/,
    text: 'Pull the rope or band toward your face with your elbows high, then let it back slowly.',
  },
  {
    test: /\bpull aparts?\b/,
    text: 'Hold the band in front of you and pull your hands apart. Squeeze your shoulder blades, then return.',
  },
  {
    test: /\brows?\b/,
    text: 'Pull the weight toward your ribs and squeeze your shoulder blades, then straighten your arms.',
  },
  {
    test: /\b(flyes?|flys?|pec deck)\b/,
    text: 'Open your arms wide, then bring them together in front of your chest. Keep a soft bend in your elbows.',
  },
  {
    test: /\b(lateral raises?|side raises?|rear delts?)\b/,
    text: 'Lift your arms out to about shoulder height, then lower them slowly. Do not swing.',
  },
  {
    test: /\bshrugs?\b/,
    text: 'Lift your shoulders toward your ears, pause, then lower them.',
  },
  {
    test: /\b(triceps?|pushdowns?|push downs?|kickbacks?)\b/,
    text: 'Straighten your arms, then bend them again. Keep your elbows still.',
  },
  {
    test: /\bcurls?\b/,
    text: 'Bend your elbows to lift the weight, then lower it. Do not swing your body.',
  },
  {
    test: /\bpallof\b/,
    text: 'Hold the band or cable at your chest and do not let it twist you. Press it straight out, then bring it back.',
  },
  {
    test: /\bdead bugs?\b/,
    text: 'Lie on your back. Reach one arm and the opposite leg away, then come back. Keep your lower back on the floor.',
  },
  {
    test: /\bbird dogs?\b/,
    text: 'On your hands and knees, reach one arm and the opposite leg out. Pause, then switch sides.',
  },
  {
    test: /\bmountain climbers?\b/,
    text: 'Hands on the floor. Bring one knee toward your chest, then the other, at a steady pace.',
  },
  {
    test: /\bplanks?\b/,
    text: 'Hold your body in a straight line from your head to your heels. Do not let your hips drop.',
  },
  {
    test: /\b(crunches|crunch|sit ups?)\b/,
    text: 'Lie on your back and curl your chest toward your knees. Do not pull on your neck.',
  },
  {
    test: /\b(rollouts?|ab wheel)\b/,
    text: 'Kneel and roll the wheel forward until your stomach works, then pull it back.',
  },
  {
    test: /\bsquats?\b/,
    text: 'Feet about shoulder width. Sit down as if you are sitting into a chair, then stand back up. Keep your knees in line with your toes.',
  },
  {
    test: /\bleg swings?\b/,
    text: 'Hold something steady and swing one leg gently forward and back.',
  },
  {
    test: /\bswings?\b/,
    text: 'Push your hips back, then stand up and let the weight swing to chest height. Your hips do the work.',
  },
  {
    test: /\b(carries|carry|farmers?)\b/,
    text: 'Walk tall while you hold the weights at your sides.',
  },
  {
    test: /\barm circles?\b/,
    text: 'Make slow circles with your arms to loosen your shoulders.',
  },
  {
    test: /\bcat cows?\b/,
    text: 'On your hands and knees, slowly round your back, then gently arch it.',
  },
  {
    test: /\b(jumping jacks?|high knees?)\b/,
    text: 'Move lightly to warm up. You should still be able to talk.',
  },
  {
    test: /\b(walk|walking|cycles?|cycling|bikes?|jogs?|jogging)\b/,
    text: 'Keep an easy pace. You should still be able to talk.',
  },
]

function exerciseKey(name: string): string {
  // Keep words like "leg". The video search key strips them, and that would
  // turn "Leg Curl" into a biceps curl.
  const raw = String(name ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[:|].*$/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return applyExerciseAliases(raw)
}

/** Everyday how-to for a known exercise. Null when the name is not a move we can explain. */
export function plainExerciseCue(name: string): string | null {
  const key = exerciseKey(name)
  if (!key) return null
  if (/\b(stretch|pose|opener|foam roll)\b/.test(key)) {
    return 'Hold this gently and breathe. Do not bounce. A mild pull is enough.'
  }
  for (const row of CUES) {
    if (row.test.test(key)) return row.text
  }
  if (/\b(press|squat|deadlift|lunge|row|curl|raise|pull|push|hinge|thrust|bridge|plank|hold)\b/.test(key)) {
    return 'Do this slowly and stay in control. If you are not sure how it should look, ask your coach in chat.'
  }
  return null
}

function asSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim().replace(/^[.(]+|[).]+$/g, '').trim()
  if (!trimmed) return ''
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!]$/.test(capped) ? capped : `${capped}.`
}

function isFullHowTo(note: string): boolean {
  return note.split(/\s+/).filter(Boolean).length >= 10
}

/**
 * The line under an exercise in the tracker.
 * A full coach sentence wins. A short aside is added after the plain how-to.
 */
export function exerciseHelpText(name: string, notes?: string | null): string | null {
  const note = notes?.replace(/\s+/g, ' ').trim() ?? ''
  const cue = plainExerciseCue(name)
  if (note && isFullHowTo(note)) return asSentence(note)
  if (cue && note) {
    const extra = asSentence(note)
    if (!extra || cue.toLowerCase().includes(note.toLowerCase())) return cue
    return `${cue} ${extra}`
  }
  if (note) return asSentence(note)
  return cue
}

/** Day titles the client sees. Programming words stay in the stored plan. */
export function plainWorkoutFocus(focus: string | null | undefined): string {
  const raw = String(focus ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const key = raw.toLowerCase()
  if (/\brest\b/.test(key)) return 'Rest'
  if (/\b(active recovery|recovery)\b/.test(key)) return 'Easy day'
  const lower = /\b(lower|legs?|quads?|hamstrings?|glutes?)\b/.test(key)
  const upper = /\b(upper|chest|push|pull|back|shoulder|arms?)\b/.test(key)
  if (lower && !upper) return 'Legs'
  if (/\b(pull|back)\b/.test(key) && !/\b(push|chest|leg|squat)\b/.test(key)) return 'Back and arms'
  if (/\b(push|chest)\b/.test(key) && !/\b(pull|back|leg|squat)\b/.test(key)) return 'Chest, shoulders, and arms'
  if (/\bshoulder\b/.test(key) && !lower) return 'Shoulders and arms'
  if (upper && !lower) return 'Upper body'
  if (/\barms?\b/.test(key)) return 'Arms'
  if (/\bcore\b/.test(key)) return 'Core'
  const stripped = raw
    .replace(/\b(hypertrophy|power|strength|density|emphasis|focus)\b/gi, '')
    .replace(/[&/+,:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped || raw
}
