/**
 * Smart Coach can update this client's own profile after they reply YES.
 * Payments, role, coach, email, and other people stay out of the patch.
 */

export type PhotoSlot = 'avatar' | 'front' | 'side' | 'back' | 'gallery'

export type ProfileChangeProposal = {
  summary: string
  columns: Record<string, string | null>
  onboarding: Record<string, Record<string, string | string[] | null>>
  photoSlot: PhotoSlot | null
  /** Storage path under this client's folder. Set by the server, never by the model. */
  photoPath: string | null
  calorieTarget: number | null
  createdAt: string
}

const TRAILER = /<<<PROFILE_CHANGE\s*(\{[\s\S]*?\})\s*>>>/i

const COLUMN_KEYS = new Set([
  'name',
  'phone',
  'age',
  'height',
  'weight',
  'gender',
  'fitness_goal',
  'client_goal_details',
  'diet_preference',
  'activity_level',
  'training_experience',
  'sleep_duration',
  'injuries',
  'medical_notes',
])

const STRING_GROUPS: Record<string, Set<string>> = {
  goals: new Set(['targetWeight', 'deadline', 'biggestStruggle', 'startingBodyType', 'goalDetails']),
  lifestyle: new Set([
    'occupation',
    'workSchoolSchedule',
    'dailySteps',
    'stressLevel',
    'waterIntake',
    'fluxCapacity',
    'dietVariety',
  ]),
  measurements: new Set(['chest', 'thigh', 'navel', 'leftBicep', 'rightBicep']),
  training: new Set([
    'location',
    'trainingDuration',
    'daysPerWeek',
    'preferredTime',
    'favoriteExercises',
    'exercisesDisliked',
    'gymLimits',
    'dumbbellMaxKg',
    'recentProgram',
    'workoutSplitPreference',
    'canSquat',
    'canPushup',
    'canPullup',
  ]),
  medical: new Set(['conditions', 'painDuringExercise', 'medications', 'acne', 'hairLoss', 'sexualHealth']),
  diet: new Set([
    'wheyProtein',
    'allergies',
    'foodsDisliked',
    'favoriteFoods',
    'customNotes',
    'previousDietsFailed',
    'cookingAbility',
    'monthlyFoodBudget',
  ]),
  eatingPattern: new Set([
    'breakfast',
    'lunch',
    'dinner',
    'snacks',
    'staple',
    'whoCooks',
    'morningDrink',
    'familyDinner',
    'eatOutDays',
  ]),
  messMenu: new Set(['text']),
}

const ARRAY_GROUPS: Record<string, Set<string>> = {
  goals: new Set(['selectedGoals', 'coachPersonalities']),
  training: new Set(['availableDays', 'equipmentAvailable', 'gymStations']),
  diet: new Set(['eggAllowedDays', 'chickenAllowedDays', 'fishAllowedDays']),
}

const PHOTO_SLOTS = new Set<PhotoSlot>(['avatar', 'front', 'side', 'back', 'gallery'])

const ACTIVITY = new Set(['sedentary', 'lightly_active', 'moderately_active', 'very_active'])
const EXPERIENCE = new Set(['beginner', 'intermediate', 'advanced'])

export function profileChangeChatInstruction(): string {
  return [
    'PROFILE: You can change this client\'s own profile from this chat after they reply YES.',
    'That includes name, phone, age, height, weight, gender, goal, diet preference, activity, training, sleep, injuries, notes, measurements, allergies, foods, whey, training days, and a daily calorie target.',
    'If they attached a photo, you can set it as avatar, front, side, back, or gallery. Ask which one if they did not say.',
    'You cannot change email, payments, prices, refunds, subscription, coach assignment, or any other client.',
    'When they ask for a profile change, end the reply with one line:',
    '<<<PROFILE_CHANGE {"summary":"short plain summary","columns":{},"onboarding":{},"photoSlot":null,"calorieTarget":null}>>>',
    'columns keys: name, phone, age, height, weight, gender, fitness_goal, client_goal_details, diet_preference, activity_level, training_experience, sleep_duration, injuries, medical_notes.',
    'onboarding groups: goals, lifestyle, measurements, training, medical, diet, eatingPattern, messMenu. Only fields they named.',
    'photoSlot is avatar, front, side, back, gallery, or null. calorieTarget is a daily kcal number or null. Do not invent a photo path.',
    'Do not say the profile is already saved. Ask them to reply YES. Reply NO cancels.',
    'A calorie target they name at or above 1800 is allowed even when it differs from the formula. Under 1800, tell them the written plan stays at the floor and do not set calorieTarget.',
  ].join('\n')
}

export function stripProfileChangeTrailer(text: string): {
  visible: string
  propose: ProfileChangeProposal | null
} {
  const match = text.match(TRAILER)
  const visible = text.replace(TRAILER, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!match?.[1]) return { visible, propose: null }
  return { visible, propose: parseProfileChangeJson(match[1]) }
}

export function parseProfileChangeJson(raw: string): ProfileChangeProposal | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return sanitizeProfileChange(parsed, null)
  } catch {
    return null
  }
}

export function profileChangeHasWork(proposal: ProfileChangeProposal | null): boolean {
  if (!proposal) return false
  return (
    Object.keys(proposal.columns).length > 0 ||
    Object.keys(proposal.onboarding).length > 0 ||
    proposal.photoSlot != null ||
    proposal.calorieTarget != null
  )
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max)
}

function asString(value: unknown, max: number): string | null | undefined {
  if (value == null) return null
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = clip(String(value), max)
  return text.length ? text : null
}

function sanitizeProfileChange(
  parsed: Record<string, unknown>,
  photoPath: string | null
): ProfileChangeProposal | null {
  const columns: Record<string, string | null> = {}
  const rawColumns = parsed.columns
  if (rawColumns && typeof rawColumns === 'object' && !Array.isArray(rawColumns)) {
    for (const [key, value] of Object.entries(rawColumns as Record<string, unknown>)) {
      if (!COLUMN_KEYS.has(key)) continue
      const text = asString(value, key === 'client_goal_details' || key === 'medical_notes' || key === 'injuries' ? 2000 : 120)
      if (text === undefined) continue
      const checked = checkColumn(key, text)
      if (checked === undefined) continue
      columns[key] = checked
    }
  }

  const onboarding: ProfileChangeProposal['onboarding'] = {}
  const rawOnboarding = parsed.onboarding
  if (rawOnboarding && typeof rawOnboarding === 'object' && !Array.isArray(rawOnboarding)) {
    for (const [group, fields] of Object.entries(rawOnboarding as Record<string, unknown>)) {
      const stringKeys = STRING_GROUPS[group]
      const arrayKeys = ARRAY_GROUPS[group]
      if (!stringKeys && !arrayKeys) continue
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue
      const next: Record<string, string | string[] | null> = {}
      for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
        if (stringKeys?.has(field)) {
          const text = asString(value, field === 'goalDetails' || field === 'text' ? 2000 : 400)
          if (text === undefined) continue
          const checked = checkOnboardingString(group, field, text)
          if (checked === undefined) continue
          next[field] = checked
        } else if (arrayKeys?.has(field)) {
          if (value == null) {
            next[field] = null
            continue
          }
          if (!Array.isArray(value)) continue
          const items = value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => clip(item, 40))
            .filter(Boolean)
            .slice(0, 8)
          if (items.length) next[field] = items
        }
      }
      if (Object.keys(next).length) onboarding[group] = next
    }
  }

  const slotRaw = typeof parsed.photoSlot === 'string' ? parsed.photoSlot.trim().toLowerCase() : ''
  const photoSlot = PHOTO_SLOTS.has(slotRaw as PhotoSlot) ? (slotRaw as PhotoSlot) : null

  let calorieTarget: number | null = null
  if (parsed.calorieTarget != null && parsed.calorieTarget !== '') {
    const kcal = Math.round(Number(parsed.calorieTarget))
    if (Number.isFinite(kcal) && kcal >= 1800 && kcal <= 4500) calorieTarget = kcal
  }

  const summaryRaw = typeof parsed.summary === 'string' ? clip(parsed.summary, 240) : ''
  const proposal: ProfileChangeProposal = {
    summary: summaryRaw,
    columns,
    onboarding,
    photoSlot,
    photoPath: photoPath && !photoPath.includes('..') ? photoPath : null,
    calorieTarget,
    createdAt: new Date().toISOString(),
  }
  if (!profileChangeHasWork(proposal)) return null
  if (!proposal.summary) proposal.summary = 'Update your profile'
  return proposal
}

function checkColumn(key: string, value: string | null): string | null | undefined {
  if (value == null) return null
  if (key === 'age') {
    const age = Number(value)
    if (!Number.isInteger(age) || age < 13 || age > 100) return undefined
    return String(age)
  }
  if (key === 'height') {
    const height = Number(value)
    if (!Number.isFinite(height) || height < 120 || height > 230) return undefined
    return String(Math.round(height * 10) / 10)
  }
  if (key === 'weight') {
    const weight = Number(value)
    if (!Number.isFinite(weight) || weight < 30 || weight > 250) return undefined
    return String(Math.round(weight * 10) / 10)
  }
  if (key === 'gender') {
    const gender = value.toLowerCase().replace(/[\s-]+/g, '_')
    if (!['male', 'female', 'other', 'non_binary'].includes(gender)) return undefined
    return gender
  }
  if (key === 'activity_level') {
    const level = value.toLowerCase().replace(/[\s-]+/g, '_')
    return ACTIVITY.has(level) ? level : undefined
  }
  if (key === 'training_experience') {
    const level = value.toLowerCase().replace(/[\s-]+/g, '_')
    return EXPERIENCE.has(level) ? level : undefined
  }
  if (key === 'phone') {
    const phone = value.replace(/[^\d+\s()-]/g, '')
    return phone.length >= 8 ? phone.slice(0, 20) : undefined
  }
  if (key === 'name') return value.length >= 2 ? value : undefined
  return value
}

function checkOnboardingString(group: string, field: string, value: string | null): string | null | undefined {
  if (value == null) return null
  if (group === 'measurements') {
    const cm = Number(value)
    if (!Number.isFinite(cm) || cm < 10 || cm > 200) return undefined
    return String(Math.round(cm * 10) / 10)
  }
  if (field === 'daysPerWeek') {
    const days = Number(value)
    if (!Number.isFinite(days) || days < 1 || days > 7) return undefined
    return String(Math.round(days))
  }
  return value
}

/** Pull a profile patch out of a plain client message when the model skips the trailer. */
export function extractProfileChangeFromText(text: string, photoPath: string | null): ProfileChangeProposal | null {
  const source = text.replace(/\s+/g, ' ').trim()
  if (!source) return null
  const wantsUpdate = /\b(update|change|set|correct|save|edit|replace|badal|kar do|karde)\b/i.test(source)
  let photoSlot: PhotoSlot | null = null
  if (photoPath) {
    if (/\bfront\b/i.test(source)) photoSlot = 'front'
    else if (/\bside\b/i.test(source)) photoSlot = 'side'
    else if (/\bback\b/i.test(source)) photoSlot = 'back'
    else if (/\b(avatar|profile photo|dp)\b/i.test(source)) photoSlot = 'avatar'
    else if (/\bgallery\b/i.test(source)) photoSlot = 'gallery'
  }
  if (!wantsUpdate && !photoSlot) return null
  const columns: Record<string, string | null> = {}
  const onboarding: ProfileChangeProposal['onboarding'] = {}

  const weight = source.match(/\b(?:weight|wazan|wt)\b[^0-9]{0,16}(\d{2,3}(?:\.\d)?)\s*(?:kg|kgs)?/i)
  if (weight?.[1]) columns.weight = weight[1]
  const height = source.match(/\b(?:height|height cm)\b[^0-9]{0,16}(\d{3}(?:\.\d)?)\s*(?:cm)?/i)
  if (height?.[1]) columns.height = height[1]
  const age = source.match(/\b(?:age|umr|umar)\b[^0-9]{0,12}(\d{2})\b/i)
  if (age?.[1]) columns.age = age[1]
  const phone = source.match(/\b(?:phone|mobile|number)\b[^0-9+]{0,12}(\+?\d[\d\s()-]{8,16})/i)
  if (phone?.[1]) columns.phone = phone[1]
  const goal = source.match(/\bgoal\b[^a-z]{0,12}(fat loss|weight loss|muscle gain|recomposition|athletic)/i)
  if (goal?.[1]) {
    const named = goal[1].toLowerCase()
    columns.fitness_goal =
      named === 'fat loss' || named === 'weight loss'
        ? 'fat_loss'
        : named === 'muscle gain'
          ? 'muscle_gain'
          : named
  }
  const diet = source.match(/\b(?:diet|food)\b[^a-z]{0,16}(vegetarian|vegan|eggetarian|non[- ]?vegetarian)/i)
  if (diet?.[1]) columns.diet_preference = diet[1].toLowerCase().replace(/[\s-]+/g, '_')

  const kcal = wantsUpdate
    ? source.match(/\b(\d{4})\s*(?:kcal|calories|calorie)\b/i)
    : null
  const calorieTarget = kcal ? Number(kcal[1]) : null

  return sanitizeProfileChange(
    {
      summary: 'Update your profile',
      columns,
      onboarding,
      photoSlot,
      calorieTarget,
    },
    photoPath
  )
}

export function withProfileConfirmCue(visible: string): string {
  if (/reply\s+yes/i.test(visible)) return visible
  return `${visible}\n\nReply YES to save this on your profile. Reply NO to cancel.`
}

export function describeProfileChange(proposal: ProfileChangeProposal): string {
  const bits: string[] = []
  for (const [key, value] of Object.entries(proposal.columns)) {
    bits.push(`${key.replace(/_/g, ' ')} ${value ?? 'cleared'}`)
  }
  for (const [group, fields] of Object.entries(proposal.onboarding)) {
    for (const [field, value] of Object.entries(fields)) {
      const shown = Array.isArray(value) ? value.join(', ') : (value ?? 'cleared')
      bits.push(`${group} ${field} ${shown}`)
    }
  }
  if (proposal.calorieTarget) bits.push(`calorie target ${proposal.calorieTarget}`)
  if (proposal.photoSlot) bits.push(`${proposal.photoSlot} photo`)
  return bits.join(', ')
}
