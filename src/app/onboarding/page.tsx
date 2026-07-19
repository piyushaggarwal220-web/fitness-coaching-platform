'use client'

import { brandTitle } from '@/lib/brand'
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OnboardingReview } from '@/components/onboarding/OnboardingReview'
import { ChipGroup, Field, MultiChipGroup, RadioCards } from '@/components/onboarding/inputs'
import { onboardingStyles as s } from '@/components/onboarding/styles'
import {
  ACTIVITY_OPTIONS,
  ACNE_OPTIONS,
  authenticateClient,
  COOKING_OPTIONS,
  DAYS_PER_WEEK_OPTIONS,
  DIET_OPTIONS,
  EQUIPMENT_OPTIONS,
  FITNESS_GOAL_OPTIONS,
  formFromProfile,
  formatMealTime24,
  GENDER_OPTIONS,
  getResumeStep,
  getSectionForStep,
  GOAL_DEADLINE_OPTIONS,
  HAIR_LOSS_OPTIONS,
  INITIAL_ONBOARDING_FORM,
  isOnboardingComplete,
  MEAL_TIMING_OPTIONS,
  OCCUPATION_OPTIONS,
  ONBOARDING_SCREEN_COUNT,
  ONBOARDING_SECTIONS,
  PAIN_OPTIONS,
  PROTEIN_DAYS_OPTIONS,
  saveOnboardingProgress,
  SEXUAL_HEALTH_OPTIONS,
  SLEEP_OPTIONS,
  STEPS_OPTIONS,
  STRUGGLE_OPTIONS,
  STRESS_OPTIONS,
  TRAINING_LOCATION_OPTIONS,
  TRAINING_OPTIONS,
  uploadOnboardingPhoto,
  validateOnboardingStep,
  WATER_OPTIONS,
  WHEY_OPTIONS,
  WORKOUT_DURATION_OPTIONS,
  WORKOUT_TIME_OPTIONS,
} from '@/lib/onboarding'
import { requestComplexityRecalculation } from '@/lib/complexity/client'
import type { OnboardingFormData } from '@/types/database'
import type { SavedPhotoUrls } from '@/lib/onboarding'

const supabase = createClient()

type PhotoKey = 'front' | 'side' | 'back'
type MealTimingKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

const MEAL_TIMING_FIELD: Record<MealTimingKey, keyof OnboardingFormData> = {
  breakfast: 'timing_breakfast',
  lunch: 'timing_lunch',
  dinner: 'timing_dinner',
  snacks: 'timing_snacks',
}

function formatMealTime(value: string): string {
  return formatMealTime24(value)
}

function defaultMealsForTiming(form: OnboardingFormData): MealTimingKey[] {
  const meals: MealTimingKey[] = ['breakfast', 'lunch', 'dinner']
  if (form.snacks.trim() && !/^none$/i.test(form.snacks.trim())) {
    meals.push('snacks')
  }
  return meals
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<OnboardingFormData>(INITIAL_ONBOARDING_FORM)
  const [photos, setPhotos] = useState<Record<PhotoKey, File | null>>({
    front: null,
    side: null,
    back: null,
  })
  const [photoUrls, setPhotoUrls] = useState<SavedPhotoUrls>({
    front: null,
    side: null,
    back: null,
  })
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [mealsForTiming, setMealsForTiming] = useState<MealTimingKey[]>(['breakfast', 'lunch', 'dinner'])
  const [confirmedMealTimes, setConfirmedMealTimes] = useState<MealTimingKey[]>([])

  useEffect(() => {
    const init = async () => {
      const result = await authenticateClient(supabase, router, {
        redirectIfOnboarded: true,
        requirePayment: true,
      })
      if (!result) return

      if (result.profileError) {
        setError('Could not load your profile. Please refresh the page.')
        setLoading(false)
        return
      }

      if (result.profile && isOnboardingComplete(result.profile)) {
        router.replace('/dashboard')
        return
      }

      setUserId(result.user.id)
      setUserEmail(result.user.email ?? null)
      if (result.profile) {
        setForm(formFromProfile(result.profile))
        setStep(getResumeStep(result.profile))
        setPhotoUrls({
          front: result.profile.progress_photo_front ?? null,
          side: result.profile.progress_photo_side ?? null,
          back: result.profile.progress_photo_back ?? null,
        })
      }
      setLoading(false)
    }
    init()
  }, [router])

  const updateForm = useCallback((patch: Partial<OnboardingFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setError('')
  }, [])

  const persistProgress = useCallback(
    async (nextStep: number, complete = false) => {
      if (!userId) return
      setSaving(true)
      try {
        const urls = { ...photoUrls }
        if (photos.front) urls.front = await uploadOnboardingPhoto(supabase, userId, photos.front, 'front')
        if (photos.side) urls.side = await uploadOnboardingPhoto(supabase, userId, photos.side, 'side')
        if (photos.back) urls.back = await uploadOnboardingPhoto(supabase, userId, photos.back, 'back')

        await saveOnboardingProgress(supabase, userId, form, {
          email: userEmail,
          step: nextStep,
          photoUrls: urls,
          complete,
        })

        if (photos.front || photos.side || photos.back) {
          setPhotoUrls(urls)
          setPhotos({ front: null, side: null, back: null })
        }
        setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      } finally {
        setSaving(false)
      }
    },
    [userId, userEmail, form, photos, photoUrls]
  )

  const handlePhotoChange = (key: PhotoKey) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setPhotos((prev) => ({ ...prev, [key]: file }))
    setError('')
  }

  useEffect(() => {
    if (step === 19 && mealsForTiming.length === 0) {
      setMealsForTiming(defaultMealsForTiming(form))
    }
  }, [step, form, mealsForTiming.length])

  // Each step should start at the top; otherwise the previous step's scroll
  // position carries over and new steps open scrolled below the heading.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      active.blur()
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [step])

  const mealTimingContext = { mealsForTiming, confirmedMeals: confirmedMealTimes }

  const handleNext = async () => {
    const validationError = validateOnboardingStep(step, form, photos, photoUrls, mealTimingContext)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    const nextStep = Math.min(step + 1, ONBOARDING_SCREEN_COUNT - 1)
    try {
      await persistProgress(nextStep)
      setStep(nextStep)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save progress')
    }
  }

  const handleBack = () => {
    setError('')
    setStep((current) => Math.max(current - 1, 0))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const validationError = validateOnboardingStep(step, form, photos, photoUrls, mealTimingContext)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!userId) return

    setSubmitting(true)
    setError('')
    try {
      await persistProgress(ONBOARDING_SCREEN_COUNT - 1, true)
      await requestComplexityRecalculation({ trigger: 'onboarding_complete' })
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding')
      setSubmitting(false)
    }
  }

  const handleEditSection = (targetStep: number) => {
    setError('')
    setStep(targetStep)
  }

  if (loading) {
    return <div style={s.loading}>Loading your coaching intake...</div>
  }

  const progress = ((step + 1) / ONBOARDING_SCREEN_COUNT) * 100
  const currentSection = getSectionForStep(step)
  const busy = submitting || saving

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <h1 style={s.title}>{brandTitle('Coaching intake')}</h1>
          <p style={s.subtitle}>
            Help your coach build a personalised diet and workout plan tailored to your life.
          </p>
        </div>

        <div style={s.progressMeta}>
          <span>
            Step {step + 1} of {ONBOARDING_SCREEN_COUNT} · {currentSection}
          </span>
          {(saving || savedAt) && (
            <span style={s.saved}>{saving ? 'Saving…' : savedAt ? `Saved ${savedAt}` : ''}</span>
          )}
        </div>
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: `${progress}%` }} />
        </div>
        <div style={s.sectionPills}>
          {ONBOARDING_SECTIONS.map((label) => (
            <span
              key={label}
              style={{
                ...s.sectionPill,
                ...(label === currentSection ? s.sectionPillActive : {}),
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {error && <div style={{ ...s.error, marginTop: 20 }}>{error}</div>}

        <form
          id="onboarding-form"
          style={{ marginTop: 24 }}
          onSubmit={step === ONBOARDING_SCREEN_COUNT - 1 ? handleSubmit : (ev) => { ev.preventDefault(); void handleNext() }}
        >
          {renderStep(
            step,
            form,
            updateForm,
            photos,
            photoUrls,
            handlePhotoChange,
            handleEditSection,
            mealsForTiming,
            setMealsForTiming,
            confirmedMealTimes,
            setConfirmedMealTimes
          )}

          <div style={{ height: 72 }} />
        </form>
      </div>

      <div style={s.fixedActions}>
        <div style={s.actionsInner}>
          {step > 0 && (
            <button type="button" onClick={handleBack} style={s.backBtn} disabled={busy}>
              Back
            </button>
          )}
          {step < ONBOARDING_SCREEN_COUNT - 1 ? (
            <button
              type="submit"
              form="onboarding-form"
              style={s.nextBtn}
              disabled={busy}
            >
              {saving ? 'Saving…' : 'Continue'}
            </button>
          ) : (
            <button
              type="submit"
              form="onboarding-form"
              style={s.nextBtn}
              disabled={busy}
            >
              {submitting ? 'Submitting…' : 'Complete intake'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function renderStep(
  step: number,
  form: OnboardingFormData,
  update: (patch: Partial<OnboardingFormData>) => void,
  photos: Record<PhotoKey, File | null>,
  photoUrls: SavedPhotoUrls,
  onPhotoChange: (key: PhotoKey) => (e: ChangeEvent<HTMLInputElement>) => void,
  onEditSection: (step: number) => void,
  mealsForTiming: MealTimingKey[],
  setMealsForTiming: (meals: MealTimingKey[]) => void,
  confirmedMealTimes: MealTimingKey[],
  setConfirmedMealTimes: (meals: MealTimingKey[] | ((prev: MealTimingKey[]) => MealTimingKey[])) => void
) {
  switch (step) {
    case 0:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Basic information</h2>
          <p style={s.stepHint}>Let&apos;s start with the essentials.</p>
          <Field label="Full name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              style={s.input}
              autoComplete="name"
            />
          </Field>
          <Field label="Age" required>
            <input
              type="number"
              value={form.age}
              onChange={(e) => update({ age: e.target.value })}
              min={13}
              max={100}
              style={s.input}
              inputMode="numeric"
            />
          </Field>
        </div>
      )

    case 1:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>About you</h2>
          <Field label="Gender" required>
            <ChipGroup options={GENDER_OPTIONS} value={form.gender} onChange={(v) => update({ gender: v })} />
          </Field>
          <div style={s.row}>
            <Field label="Height (cm)" required>
              <input
                type="number"
                value={form.height}
                onChange={(e) => update({ height: e.target.value })}
                style={s.input}
                inputMode="decimal"
              />
            </Field>
            <Field label="Weight (kg)" required>
              <input
                type="number"
                value={form.weight}
                onChange={(e) => update({ weight: e.target.value })}
                style={s.input}
                inputMode="decimal"
              />
            </Field>
          </div>
        </div>
      )

    case 2:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Your goal</h2>
          <Field label="Primary goal" required>
            <RadioCards
              name="fitness_goal"
              options={FITNESS_GOAL_OPTIONS}
              value={form.fitness_goal}
              onChange={(v) => update({ fitness_goal: v })}
            />
          </Field>
          {form.fitness_goal === 'ai_decide' && (
            <p style={s.stepHint}>
              No problem — we&apos;ll analyse your body stats, lifestyle, and photos to recommend the best goal for you.
            </p>
          )}
        </div>
      )

    case 3:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Goal timeline</h2>
          <Field label="Target deadline" required>
            <ChipGroup
              options={GOAL_DEADLINE_OPTIONS}
              value={form.goal_deadline}
              onChange={(v) => update({ goal_deadline: v })}
            />
          </Field>
          <Field label="Biggest struggle right now" required hint="Pick the closest match, then add detail if you like.">
            <ChipGroup
              options={STRUGGLE_OPTIONS}
              value={form.biggest_struggle.split('|')[0] ?? ''}
              onChange={(v) => {
                const detail = form.biggest_struggle.includes('|') ? form.biggest_struggle.split('|').slice(1).join('|') : ''
                update({ biggest_struggle: detail ? `${v}|${detail}` : v })
              }}
            />
            <textarea
              value={form.biggest_struggle.includes('|') ? form.biggest_struggle.split('|').slice(1).join('|') : ''}
              onChange={(e) => {
                const chip = form.biggest_struggle.split('|')[0] ?? ''
                const selectedChip = STRUGGLE_OPTIONS.some((o) => o.value === chip) ? chip : ''
                update({ biggest_struggle: selectedChip ? `${selectedChip}|${e.target.value}` : e.target.value })
              }}
              placeholder="Optional — tell your coach more about this…"
              style={{ ...s.textarea, marginTop: 12 }}
            />
          </Field>
        </div>
      )

    case 4:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Daily life</h2>
          <Field label="Occupation" required>
            <ChipGroup options={OCCUPATION_OPTIONS} value={form.occupation} onChange={(v) => update({ occupation: v })} />
          </Field>
          <Field label="Daily activity level" required>
            <ChipGroup options={ACTIVITY_OPTIONS} value={form.activity_level} onChange={(v) => update({ activity_level: v })} />
          </Field>
        </div>
      )

    case 5:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Movement & sleep</h2>
          <Field label="Daily steps (estimate)" required>
            <ChipGroup options={STEPS_OPTIONS} value={form.daily_steps} onChange={(v) => update({ daily_steps: v })} />
          </Field>
          <Field label="Sleep duration" required>
            <ChipGroup options={SLEEP_OPTIONS} value={form.sleep_duration} onChange={(v) => update({ sleep_duration: v })} />
          </Field>
        </div>
      )

    case 6:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Recovery habits</h2>
          <Field label="Stress level" required>
            <ChipGroup options={STRESS_OPTIONS} value={form.stress_level} onChange={(v) => update({ stress_level: v })} />
          </Field>
          <Field label="Water intake per day" required>
            <ChipGroup options={WATER_OPTIONS} value={form.water_intake} onChange={(v) => update({ water_intake: v })} />
          </Field>
        </div>
      )

    case 7:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Training setup</h2>
          <Field label="Where do you train?" required>
            <ChipGroup options={TRAINING_LOCATION_OPTIONS} value={form.training_location} onChange={(v) => update({ training_location: v })} />
          </Field>
          <Field label="Training experience" required>
            <RadioCards
              name="training_experience"
              options={TRAINING_OPTIONS}
              value={form.training_experience}
              onChange={(v) => update({ training_experience: v })}
            />
          </Field>
        </div>
      )

    case 8:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Training schedule</h2>
          <Field label="Days available per week" required>
            <ChipGroup options={DAYS_PER_WEEK_OPTIONS} value={form.training_days_per_week} onChange={(v) => update({ training_days_per_week: v })} />
          </Field>
          <Field label="Workout duration" required>
            <ChipGroup options={WORKOUT_DURATION_OPTIONS} value={form.workout_duration} onChange={(v) => update({ workout_duration: v })} />
          </Field>
          <Field label="Preferred workout time" required>
            <ChipGroup options={WORKOUT_TIME_OPTIONS} value={form.preferred_workout_time} onChange={(v) => update({ preferred_workout_time: v })} />
          </Field>
        </div>
      )

    case 9:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Equipment</h2>
          <p style={s.stepHint}>
            {form.training_location === 'gym'
              ? 'Select what you typically use at the gym.'
              : 'Select everything you have access to at home.'}
          </p>
          <Field label="Equipment available" required={form.training_location !== 'gym'}>
            <MultiChipGroup
              options={EQUIPMENT_OPTIONS}
              values={form.equipment_available}
              onChange={(v) => update({ equipment_available: v })}
            />
          </Field>
        </div>
      )

    case 10:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Exercise preferences</h2>
          <Field label="Favourite exercises" hint="Optional — helps your coach program what you enjoy.">
            <textarea
              value={form.favorite_exercises}
              onChange={(e) => update({ favorite_exercises: e.target.value })}
              placeholder="e.g. squats, lat pulldowns, walking"
              style={s.textarea}
            />
          </Field>
          <Field label="Exercises you dislike or want to avoid" hint="Optional">
            <textarea
              value={form.exercises_disliked}
              onChange={(e) => update({ exercises_disliked: e.target.value })}
              placeholder="e.g. burpees, running"
              style={s.textarea}
            />
          </Field>
        </div>
      )

    case 11:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Medical background</h2>
          <Field label="Current or past injuries" hint="Optional">
            <textarea
              value={form.injuries}
              onChange={(e) => update({ injuries: e.target.value })}
              placeholder="e.g. lower back pain, old shoulder injury"
              style={s.textarea}
            />
          </Field>
          <Field label="Medical conditions" hint="Optional — diabetes, thyroid, PCOS, etc.">
            <textarea
              value={form.medical_notes}
              onChange={(e) => update({ medical_notes: e.target.value })}
              style={s.textarea}
            />
          </Field>
          <Field label="Acne" required>
            <ChipGroup options={ACNE_OPTIONS} value={form.acne_status} onChange={(v) => update({ acne_status: v })} />
          </Field>
          <Field label="Hair loss" required>
            <ChipGroup options={HAIR_LOSS_OPTIONS} value={form.hair_loss_status} onChange={(v) => update({ hair_loss_status: v })} />
          </Field>
          <Field label="Sexual health" required>
            <ChipGroup options={SEXUAL_HEALTH_OPTIONS} value={form.sexual_health_status} onChange={(v) => update({ sexual_health_status: v })} />
          </Field>
        </div>
      )

    case 12:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Health & medications</h2>
          <Field label="Pain during exercise?" required>
            <ChipGroup options={PAIN_OPTIONS} value={form.pain_during_exercise} onChange={(v) => update({ pain_during_exercise: v })} />
          </Field>
          <Field label="Current medications" hint="Optional">
            <textarea
              value={form.medications}
              onChange={(e) => update({ medications: e.target.value })}
              placeholder="List any medications or write None"
              style={s.textarea}
            />
          </Field>
        </div>
      )

    case 13:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Diet type</h2>
          <Field label="Which best describes your diet?" required>
            <RadioCards
              name="diet_preference"
              options={DIET_OPTIONS}
              value={form.diet_preference}
              onChange={(v) => update({ diet_preference: v })}
            />
          </Field>
        </div>
      )

    case 14:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Protein sources</h2>
          <Field label="Egg days per week">
            <ChipGroup options={PROTEIN_DAYS_OPTIONS} value={form.egg_days} onChange={(v) => update({ egg_days: v })} />
          </Field>
          {form.diet_preference === 'non_vegetarian' && (
            <>
              <Field label="Chicken days per week">
                <ChipGroup options={PROTEIN_DAYS_OPTIONS} value={form.chicken_days} onChange={(v) => update({ chicken_days: v })} />
              </Field>
              <Field label="Fish days per week">
                <ChipGroup options={PROTEIN_DAYS_OPTIONS} value={form.fish_days} onChange={(v) => update({ fish_days: v })} />
              </Field>
            </>
          )}
          <Field label="Do you use whey protein?" required>
            <ChipGroup options={WHEY_OPTIONS} value={form.whey_protein} onChange={(v) => update({ whey_protein: v })} />
          </Field>
        </div>
      )

    case 15:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Food preferences</h2>
          <Field label="Allergies" hint="Optional">
            <textarea
              value={form.food_allergies}
              onChange={(e) => update({ food_allergies: e.target.value })}
              placeholder="e.g. nuts, dairy, gluten"
              style={s.textarea}
            />
          </Field>
          <Field label="Foods you dislike" hint="Optional">
            <textarea
              value={form.foods_disliked}
              onChange={(e) => update({ foods_disliked: e.target.value })}
              style={s.textarea}
            />
          </Field>
        </div>
      )

    case 16:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Budget & cooking</h2>
          <Field label="Favourite foods" hint="Optional">
            <textarea
              value={form.favorite_foods}
              onChange={(e) => update({ favorite_foods: e.target.value })}
              placeholder="Foods you enjoy and eat often"
              style={s.textarea}
            />
          </Field>
          <Field label="Monthly food budget" required hint="Enter your own monthly food budget in rupees.">
            <input
              type="text"
              inputMode="numeric"
              value={form.monthly_food_budget}
              onChange={(e) => update({ monthly_food_budget: e.target.value })}
              placeholder="e.g. 8000"
              style={s.input}
            />
          </Field>
          <Field label="Cooking ability" required>
            <ChipGroup options={COOKING_OPTIONS} value={form.cooking_ability} onChange={(v) => update({ cooking_ability: v })} />
          </Field>
        </div>
      )

    case 17:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>What you eat now</h2>
          <p style={s.stepHint}>Your coach will adapt to your current routine — not replace it overnight.</p>
          <Field label="Typical breakfast" required>
            <textarea
              value={form.breakfast}
              onChange={(e) => update({ breakfast: e.target.value })}
              placeholder="What you usually eat"
              style={s.textarea}
            />
          </Field>
          <Field label="Typical lunch" required>
            <textarea
              value={form.lunch}
              onChange={(e) => update({ lunch: e.target.value })}
              style={s.textarea}
            />
          </Field>
        </div>
      )

    case 18:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Evening eating</h2>
          <Field label="Typical dinner" required>
            <textarea
              value={form.dinner}
              onChange={(e) => update({ dinner: e.target.value })}
              style={s.textarea}
            />
          </Field>
          <Field label="Snacks" required hint='Write "None" if you don&apos;t snack.'>
            <textarea
              value={form.snacks}
              onChange={(e) => update({ snacks: e.target.value })}
              style={s.textarea}
            />
          </Field>
        </div>
      )

    case 19:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Meal timings</h2>
          <p style={s.stepHint}>Select which meals you want to set times for, enter approximate times, then confirm each one.</p>

          <Field label="Which meals should we time?" required>
            <MultiChipGroup
              options={MEAL_TIMING_OPTIONS}
              values={mealsForTiming}
              onChange={(values) => {
                const next = values as MealTimingKey[]
                setMealsForTiming(next)
                setConfirmedMealTimes((prev) => prev.filter((meal) => next.includes(meal)))
              }}
            />
          </Field>

          {mealsForTiming.includes('breakfast') && (
            <Field label="Breakfast time" required>
              <input
                type="time"
                value={form.timing_breakfast}
                onChange={(e) => {
                  update({ timing_breakfast: e.target.value })
                  setConfirmedMealTimes((prev) => prev.filter((meal) => meal !== 'breakfast'))
                }}
                style={s.input}
              />
            </Field>
          )}
          {mealsForTiming.includes('lunch') && (
            <Field label="Lunch time" required>
              <input
                type="time"
                value={form.timing_lunch}
                onChange={(e) => {
                  update({ timing_lunch: e.target.value })
                  setConfirmedMealTimes((prev) => prev.filter((meal) => meal !== 'lunch'))
                }}
                style={s.input}
              />
            </Field>
          )}
          {mealsForTiming.includes('dinner') && (
            <Field label="Dinner time" required>
              <input
                type="time"
                value={form.timing_dinner}
                onChange={(e) => {
                  update({ timing_dinner: e.target.value })
                  setConfirmedMealTimes((prev) => prev.filter((meal) => meal !== 'dinner'))
                }}
                style={s.input}
              />
            </Field>
          )}
          {mealsForTiming.includes('snacks') && (
            <Field label="Snack time" required>
              <input
                type="time"
                value={form.timing_snacks}
                onChange={(e) => {
                  update({ timing_snacks: e.target.value })
                  setConfirmedMealTimes((prev) => prev.filter((meal) => meal !== 'snacks'))
                }}
                style={s.input}
              />
            </Field>
          )}

          {mealsForTiming.length > 0 && (
            <div>
              <p style={{ ...s.stepHint, marginBottom: 12 }}>Confirm each meal time before continuing.</p>
              <div style={s.timingConfirmList}>
                {mealsForTiming.map((meal) => {
                  const label = MEAL_TIMING_OPTIONS.find((option) => option.value === meal)?.label ?? meal
                  const timeValue = String(form[MEAL_TIMING_FIELD[meal]] ?? '')
                  const confirmed = confirmedMealTimes.includes(meal)
                  return (
                    <div
                      key={meal}
                      style={{ ...s.timingConfirmRow, ...(confirmed ? s.timingConfirmRowDone : {}) }}
                    >
                      <div>
                        <div style={s.timingConfirmLabel}>{label}</div>
                        <div style={s.timingConfirmTime}>{formatMealTime(timeValue)}</div>
                      </div>
                      <button
                        type="button"
                        disabled={!timeValue || confirmed}
                        style={{ ...s.timingConfirmBtn, ...(confirmed ? s.timingConfirmBtnDone : {}) }}
                        onClick={() => {
                          if (!timeValue) return
                          setConfirmedMealTimes((prev) => (prev.includes(meal) ? prev : [...prev, meal]))
                        }}
                      >
                        {confirmed ? 'Confirmed ✓' : 'Confirm time'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )

    case 20:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Supplements</h2>
          <Field label="Current supplements" required hint='List everything you take, or write "None".'>
            <textarea
              value={form.current_supplements}
              onChange={(e) => update({ current_supplements: e.target.value })}
              placeholder="e.g. creatine, multivitamin, vitamin D"
              style={s.textarea}
            />
          </Field>
        </div>
      )

    case 21:
      return (
        <div style={s.stepContent}>
          <h2 style={s.stepTitle}>Progress photos</h2>
          <div style={s.privacyNotice}>
            Your photos are completely private and are never shared or published anywhere without your explicit permission.
            They are used only by your assigned coach and our AI to create more accurate recommendations.
          </div>
          <div style={s.photoGrid}>
            {(['front', 'side', 'back'] as PhotoKey[]).map((key) => (
              <Field key={key} label={`${key.charAt(0).toUpperCase()}${key.slice(1)} photo`} required>
                <input type="file" accept="image/*" capture="environment" onChange={onPhotoChange(key)} style={s.input} />
                {photoUrls[key] && !photos[key] && (
                  <p style={s.photoPreview}>Previously uploaded — select a new file to replace.</p>
                )}
                {photos[key] && <p style={s.photoPreview}>{photos[key]!.name} selected</p>}
              </Field>
            ))}
          </div>
        </div>
      )

    case 22:
      return (
        <OnboardingReview
          form={form}
          photoUrls={photoUrls}
          onEditSection={onEditSection}
          termsAccepted={form.terms_accepted}
          onTermsChange={(accepted) => update({ terms_accepted: accepted })}
        />
      )

    default:
      return null
  }
}
