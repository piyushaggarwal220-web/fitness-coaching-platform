import { profileWithAiFields } from '@/lib/onboarding'
import type { Checkin, OnboardingProfile } from '@/types/database'

/** Map onboarding profile + check-in to complexity engine input. */
export function profileToComplexityInput(
  profile: OnboardingProfile,
  latestCheckin?: Checkin | null
) {
  const enriched = profileWithAiFields(profile)
  return {
    age: enriched.age,
    gender: enriched.gender,
    height: enriched.height,
    weight: enriched.weight,
    fitnessGoal: enriched.fitness_goal,
    activityLevel: enriched.activity_level,
    trainingExperience: enriched.training_experience,
    dietPreference: enriched.diet_preference,
    injuries: enriched.injuries,
    medicalNotes: enriched.medical_notes,
    sleepDuration: enriched.sleep_duration,
    latestCheckin: latestCheckin
      ? {
          energy_level: latestCheckin.energy_level,
          hunger_level: latestCheckin.hunger_level,
          training_performance: latestCheckin.training_performance,
          adherence_score: latestCheckin.adherence_score,
          notes: latestCheckin.notes,
        }
      : undefined,
  }
}
