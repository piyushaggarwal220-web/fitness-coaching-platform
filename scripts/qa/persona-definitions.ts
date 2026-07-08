import type { Checkin, OnboardingProfile, Plan } from '../../src/types/database'

const now = new Date().toISOString()

export type PersonaGroup =
  | 'Fat Loss'
  | 'Muscle Gain'
  | 'Body Recomposition'
  | 'Strength'
  | 'Hybrid Athlete'
  | 'Home Workout'
  | 'Lifestyle'
  | 'Special Cases'

export type CheckinScenario =
  | 'lost_too_much_weight'
  | 'weight_unchanged'
  | 'strength_increased'
  | 'missed_workouts'
  | 'poor_sleep'
  | 'high_hunger'
  | 'low_motivation'
  | 'excellent_adherence'

export type PersonaDefinition = {
  id: string
  group: PersonaGroup
  label: string
  profile: OnboardingProfile
  checkinScenario: CheckinScenario
  preferredExercises?: string
  exercisesToAvoid?: string
  budgetMonthly?: number
}

function base(overrides: Partial<OnboardingProfile> & { name: string }): OnboardingProfile {
  const onboarding = overrides.onboarding_data ?? {}
  return {
    id: `qa-${overrides.name.toLowerCase().replace(/\s+/g, '-')}`,
    email: `${overrides.name.replace(/\s+/g, '.').toLowerCase()}@qa.test`,
    name: overrides.name,
    role: 'client',
    coach_id: 'coach-qa',
    age: overrides.age ?? 28,
    gender: overrides.gender ?? 'female',
    height: overrides.height ?? 165,
    weight: overrides.weight ?? 68,
    fitness_goal: overrides.fitness_goal ?? 'fat_loss',
    activity_level: overrides.activity_level ?? 'moderately_active',
    training_experience: overrides.training_experience ?? 'beginner',
    diet_preference: overrides.diet_preference ?? 'vegetarian',
    sleep_duration: overrides.sleep_duration ?? '7_to_8',
    injuries: overrides.injuries ?? null,
    medical_notes: overrides.medical_notes ?? null,
    onboarding_data: {
      version: 1,
      resumeStep: 10,
      goals: {
        targetWeight: '62',
        deadline: '12 weeks',
        biggestStruggle: 'consistency',
        ...(onboarding.goals ?? {}),
      },
      lifestyle: {
        occupation: 'office worker',
        dailySteps: '5000',
        stressLevel: 'moderate',
        waterIntake: '2L',
        ...(onboarding.lifestyle ?? {}),
      },
      training: {
        location: 'gym',
        daysPerWeek: '4',
        durationMinutes: '60',
        preferredTime: 'evening',
        equipmentAvailable: ['barbell', 'dumbbells', 'cables', 'leg press'],
        favoriteExercises: 'squats and rows',
        exercisesDisliked: 'burpees',
        ...(onboarding.training ?? {}),
      },
      diet: {
        eggDaysPerWeek: '0',
        chickenDaysPerWeek: '0',
        fishDaysPerWeek: '2',
        wheyProtein: 'yes',
        allergies: 'none',
        foodsDisliked: 'mushrooms',
        favoriteFoods: 'dal, paneer, idli, curd rice',
        monthlyFoodBudget: '8000',
        cookingAbility: 'basic',
        ...(onboarding.diet ?? {}),
      },
      eatingPattern: {
        breakfast: '8:30 am — poha or idli',
        lunch: '1:30 pm — rice, dal, sabzi',
        dinner: '9:00 pm — roti, paneer, salad',
        snacks: '6:30 pm — tea with roasted chana',
        ...(onboarding.eatingPattern ?? {}),
      },
      medical: onboarding.medical,
      supplements: onboarding.supplements,
    },
    onboarding_complete: true,
    plan_delivered: false,
    created_at: now,
    updated_at: now,
  }
}

export const QA_PERSONAS: PersonaDefinition[] = [
  {
    id: 'fat-loss-male-beginner-gym',
    group: 'Fat Loss',
    label: 'Male beginner, gym',
    checkinScenario: 'high_hunger',
    profile: base({
      name: 'Arjun Patel',
      age: 24,
      gender: 'male',
      weight: 82,
      height: 175,
      fitness_goal: 'fat_loss',
      training_experience: 'beginner',
      diet_preference: 'non_vegetarian',
      onboarding_data: {
        training: { location: 'gym', daysPerWeek: '4', durationMinutes: '60' },
        goals: { targetWeight: '74', biggestStruggle: 'weekend eating' },
      },
    }),
  },
  {
    id: 'fat-loss-female-beginner-home',
    group: 'Fat Loss',
    label: 'Female beginner, home',
    checkinScenario: 'excellent_adherence',
    profile: base({
      name: 'Sneha Iyer',
      age: 27,
      gender: 'female',
      weight: 68,
      fitness_goal: 'fat_loss',
      training_experience: 'beginner',
      onboarding_data: {
        training: {
          location: 'home',
          daysPerWeek: '3',
          durationMinutes: '45',
          equipmentAvailable: ['resistance bands', 'yoga mat'],
        },
      },
    }),
  },
  {
    id: 'fat-loss-office-worker',
    group: 'Fat Loss',
    label: 'Office worker',
    checkinScenario: 'weight_unchanged',
    profile: base({
      name: 'Karan Desai',
      age: 34,
      gender: 'male',
      weight: 88,
      activity_level: 'sedentary',
      fitness_goal: 'fat_loss',
      onboarding_data: {
        lifestyle: { occupation: 'desk job — 10hr sitting', dailySteps: '3000', stressLevel: 'high' },
        eatingPattern: {
          breakfast: '9:30 am — office canteen sandwich',
          lunch: '2:00 pm — thali from office',
          dinner: '10:30 pm — late delivery biryani',
        },
      },
    }),
  },
  {
    id: 'fat-loss-night-shift',
    group: 'Fat Loss',
    label: 'Night shift worker',
    checkinScenario: 'poor_sleep',
    profile: base({
      name: 'Divya Nair',
      age: 31,
      gender: 'female',
      weight: 71,
      sleep_duration: 'less_than_6',
      fitness_goal: 'fat_loss',
      onboarding_data: {
        lifestyle: { occupation: 'hospital nurse — night shifts', stressLevel: 'high' },
        eatingPattern: {
          breakfast: '7:00 am post-shift — paratha and chai',
          lunch: '2:00 pm — sleep, skip or light snack',
          dinner: '8:00 pm pre-shift — rice and curry',
        },
        training: { preferredTime: 'morning after shift', daysPerWeek: '3' },
      },
    }),
  },
  {
    id: 'fat-loss-budget',
    group: 'Fat Loss',
    label: 'Budget client',
    checkinScenario: 'low_motivation',
    budgetMonthly: 4500,
    checkinScenario: 'low_motivation',
    profile: base({
      name: 'Ravi Kumar',
      age: 29,
      gender: 'male',
      weight: 76,
      fitness_goal: 'fat_loss',
      diet_preference: 'vegetarian',
      onboarding_data: {
        diet: { monthlyFoodBudget: '4500', cookingAbility: 'basic', favoriteFoods: 'dal, rice, seasonal sabzi' },
        goals: { biggestStruggle: 'affording protein' },
      },
    }),
  },
  {
    id: 'muscle-skinny-beginner',
    group: 'Muscle Gain',
    label: 'Skinny beginner',
    checkinScenario: 'strength_increased',
    profile: base({
      name: 'Amit Joshi',
      age: 22,
      gender: 'male',
      weight: 58,
      height: 178,
      fitness_goal: 'muscle_gain',
      training_experience: 'beginner',
      diet_preference: 'eggetarian',
      onboarding_data: {
        goals: { targetWeight: '68', biggestStruggle: 'not eating enough' },
        training: { daysPerWeek: '4', durationMinutes: '60' },
      },
    }),
  },
  {
    id: 'muscle-intermediate-lifter',
    group: 'Muscle Gain',
    label: 'Intermediate lifter',
    checkinScenario: 'excellent_adherence',
    profile: base({
      name: 'Vikram Singh',
      age: 28,
      gender: 'male',
      weight: 78,
      height: 180,
      fitness_goal: 'muscle_gain',
      training_experience: 'intermediate',
      diet_preference: 'non_vegetarian',
      onboarding_data: {
        training: { daysPerWeek: '5', durationMinutes: '75', location: 'gym' },
      },
    }),
  },
  {
    id: 'muscle-advanced-bodybuilder',
    group: 'Muscle Gain',
    label: 'Advanced bodybuilder',
    checkinScenario: 'strength_increased',
    profile: base({
      name: 'Rohan Malhotra',
      age: 32,
      gender: 'male',
      weight: 92,
      height: 183,
      fitness_goal: 'muscle_gain',
      training_experience: 'advanced',
      diet_preference: 'non_vegetarian',
      onboarding_data: {
        training: { daysPerWeek: '6', durationMinutes: '90', location: 'gym' },
        diet: { wheyProtein: 'yes', monthlyFoodBudget: '15000' },
      },
    }),
  },
  {
    id: 'muscle-vegetarian',
    group: 'Muscle Gain',
    label: 'Vegetarian muscle gain',
    checkinScenario: 'high_hunger',
    profile: base({
      name: 'Ananya Reddy',
      age: 26,
      gender: 'female',
      weight: 55,
      height: 160,
      fitness_goal: 'muscle_gain',
      training_experience: 'intermediate',
      diet_preference: 'vegetarian',
      onboarding_data: {
        diet: { favoriteFoods: 'paneer, soya, dal, greek yogurt' },
        training: { daysPerWeek: '4' },
      },
    }),
  },
  {
    id: 'muscle-home-workout',
    group: 'Muscle Gain',
    label: 'Home workout muscle gain',
    checkinScenario: 'missed_workouts',
    profile: base({
      name: 'Meera Shah',
      age: 30,
      gender: 'female',
      weight: 62,
      fitness_goal: 'muscle_gain',
      training_experience: 'intermediate',
      onboarding_data: {
        training: {
          location: 'home',
          daysPerWeek: '4',
          durationMinutes: '50',
          equipmentAvailable: ['adjustable dumbbells', 'bench'],
          favoriteExercises: 'goblet squats, dumbbell press',
        },
      },
    }),
  },
  {
    id: 'recomp-gym',
    group: 'Body Recomposition',
    label: 'Gym recomposition',
    checkinScenario: 'weight_unchanged',
    profile: base({
      name: 'Neha Kapoor',
      age: 33,
      gender: 'female',
      weight: 65,
      fitness_goal: 'recomposition',
      training_experience: 'intermediate',
      onboarding_data: { training: { location: 'gym', daysPerWeek: '4' } },
    }),
  },
  {
    id: 'recomp-home',
    group: 'Body Recomposition',
    label: 'Home recomposition',
    checkinScenario: 'excellent_adherence',
    profile: base({
      name: 'Pooja Menon',
      age: 35,
      gender: 'female',
      weight: 70,
      fitness_goal: 'recomposition',
      training_experience: 'beginner',
      onboarding_data: {
        training: {
          location: 'home',
          daysPerWeek: '3',
          equipmentAvailable: ['dumbbells', 'resistance bands'],
        },
      },
    }),
  },
  {
    id: 'strength-powerlifting',
    group: 'Strength',
    label: 'Powerlifting focused',
    checkinScenario: 'strength_increased',
    preferredExercises: 'squat, bench press, deadlift',
    profile: base({
      name: 'Harpreet Gill',
      age: 29,
      gender: 'male',
      weight: 95,
      height: 178,
      fitness_goal: 'strength',
      training_experience: 'advanced',
      diet_preference: 'non_vegetarian',
      onboarding_data: {
        training: {
          location: 'gym',
          daysPerWeek: '4',
          durationMinutes: '90',
          favoriteExercises: 'squat, bench press, deadlift',
          exercisesDisliked: 'machine isolation work',
        },
      },
    }),
  },
  {
    id: 'hybrid-runner-lifter',
    group: 'Hybrid Athlete',
    label: 'Runs + lifts',
    checkinScenario: 'poor_sleep',
    profile: base({
      name: 'Aditya Rao',
      age: 27,
      gender: 'male',
      weight: 72,
      fitness_goal: 'athletic_performance',
      training_experience: 'intermediate',
      activity_level: 'very_active',
      onboarding_data: {
        goals: { biggestStruggle: 'balancing running and lifting recovery' },
        training: {
          location: 'gym',
          daysPerWeek: '5',
          favoriteExercises: 'squats, tempo runs',
          exercisesDisliked: 'excessive isolation',
        },
        lifestyle: { dailySteps: '12000' },
      },
    }),
  },
  {
    id: 'home-dumbbells-only',
    group: 'Home Workout',
    label: 'Dumbbells only',
    checkinScenario: 'excellent_adherence',
    profile: base({
      name: 'Lakshmi Venkat',
      age: 28,
      gender: 'female',
      weight: 64,
      fitness_goal: 'muscle_gain',
      training_experience: 'beginner',
      onboarding_data: {
        training: {
          location: 'home',
          daysPerWeek: '3',
          durationMinutes: '45',
          equipmentAvailable: ['dumbbells'],
          favoriteExercises: 'goblet squat, dumbbell row',
        },
      },
    }),
  },
  {
    id: 'home-bands-only',
    group: 'Home Workout',
    label: 'Resistance bands only',
    checkinScenario: 'missed_workouts',
    profile: base({
      name: 'Suresh Babu',
      age: 40,
      gender: 'male',
      weight: 78,
      fitness_goal: 'fat_loss',
      training_experience: 'beginner',
      onboarding_data: {
        training: {
          location: 'home',
          daysPerWeek: '3',
          equipmentAvailable: ['resistance bands', 'door anchor'],
        },
      },
    }),
  },
  {
    id: 'home-pullup-bar',
    group: 'Home Workout',
    label: 'Pull-up bar only',
    checkinScenario: 'strength_increased',
    profile: base({
      name: 'Ishaan Khanna',
      age: 25,
      gender: 'male',
      weight: 70,
      fitness_goal: 'muscle_gain',
      training_experience: 'intermediate',
      onboarding_data: {
        training: {
          location: 'home',
          daysPerWeek: '4',
          equipmentAvailable: ['pull-up bar', 'dip station'],
          favoriteExercises: 'pull-ups, dips',
        },
      },
    }),
  },
  {
    id: 'home-no-equipment',
    group: 'Home Workout',
    label: 'No equipment',
    checkinScenario: 'low_motivation',
    profile: base({
      name: 'Tanvi Agarwal',
      age: 23,
      gender: 'female',
      weight: 58,
      fitness_goal: 'fat_loss',
      training_experience: 'beginner',
      onboarding_data: {
        training: {
          location: 'home',
          daysPerWeek: '3',
          durationMinutes: '30',
          equipmentAvailable: [],
          exercisesDisliked: 'burpees, jumping jacks',
        },
      },
    }),
  },
  {
    id: 'lifestyle-college-student',
    group: 'Lifestyle',
    label: 'College student',
    checkinScenario: 'high_hunger',
    budgetMonthly: 5000,
    profile: base({
      name: 'Rahul Verma',
      age: 20,
      gender: 'male',
      weight: 66,
      fitness_goal: 'muscle_gain',
      training_experience: 'beginner',
      activity_level: 'lightly_active',
      onboarding_data: {
        lifestyle: { occupation: 'college student — hostel mess', stressLevel: 'moderate' },
        diet: { monthlyFoodBudget: '5000', cookingAbility: 'none — hostel mess only' },
        training: { location: 'gym', daysPerWeek: '3', durationMinutes: '45' },
      },
    }),
  },
  {
    id: 'lifestyle-busy-parent',
    group: 'Lifestyle',
    label: 'Busy parent',
    checkinScenario: 'missed_workouts',
    profile: base({
      name: 'Priya Nambiar',
      age: 38,
      gender: 'female',
      weight: 72,
      fitness_goal: 'fat_loss',
      training_experience: 'beginner',
      onboarding_data: {
        lifestyle: { occupation: 'working parent — two young kids', stressLevel: 'high' },
        training: { location: 'home', daysPerWeek: '3', durationMinutes: '30' },
        goals: { biggestStruggle: 'finding time to train' },
      },
    }),
  },
  {
    id: 'lifestyle-traveller',
    group: 'Lifestyle',
    label: 'Frequent traveller',
    checkinScenario: 'weight_unchanged',
    profile: base({
      name: 'Sanjay Mehta',
      age: 42,
      gender: 'male',
      weight: 84,
      fitness_goal: 'recomposition',
      training_experience: 'intermediate',
      onboarding_data: {
        lifestyle: { occupation: 'consultant — travel 2 weeks/month', stressLevel: 'high' },
        training: {
          location: 'both',
          daysPerWeek: '4',
          equipmentAvailable: ['hotel gym', 'dumbbells', 'cables'],
        },
        goals: { biggestStruggle: 'inconsistent training while travelling' },
      },
    }),
  },
  {
    id: 'special-knee-pain',
    group: 'Special Cases',
    label: 'Knee pain',
    checkinScenario: 'poor_sleep',
    exercisesToAvoid: 'deep squats, jumping, lunges',
    profile: base({
      name: 'Geeta Sharma',
      age: 45,
      gender: 'female',
      weight: 74,
      fitness_goal: 'fat_loss',
      injuries: 'chronic knee pain — patellofemoral irritation; avoid deep squats and jumping',
      onboarding_data: {
        training: {
          location: 'gym',
          daysPerWeek: '3',
          exercisesDisliked: 'lunges, box jumps',
        },
      },
    }),
  },
  {
    id: 'special-shoulder-discomfort',
    group: 'Special Cases',
    label: 'Shoulder discomfort',
    checkinScenario: 'missed_workouts',
    exercisesToAvoid: 'overhead press, dips behind neck',
    profile: base({
      name: 'Manish Tiwari',
      age: 36,
      gender: 'male',
      weight: 80,
      fitness_goal: 'muscle_gain',
      injuries: 'shoulder impingement — pain with overhead pressing',
      onboarding_data: {
        training: {
          location: 'gym',
          daysPerWeek: '4',
          favoriteExercises: 'chest-supported rows, leg press',
          exercisesDisliked: 'behind-neck press, upright rows',
        },
      },
    }),
  },
  {
    id: 'special-poor-sleep',
    group: 'Special Cases',
    label: 'Poor sleep',
    checkinScenario: 'poor_sleep',
    profile: base({
      name: 'Kavya Pillai',
      age: 30,
      gender: 'female',
      weight: 63,
      sleep_duration: 'less_than_6',
      fitness_goal: 'fat_loss',
      onboarding_data: {
        lifestyle: { stressLevel: 'high', occupation: 'startup founder' },
        goals: { biggestStruggle: 'sleep and late-night snacking' },
      },
    }),
  },
  {
    id: 'special-high-stress',
    group: 'Special Cases',
    label: 'High stress',
    checkinScenario: 'low_motivation',
    profile: base({
      name: 'Deepak Choudhury',
      age: 37,
      gender: 'male',
      weight: 86,
      fitness_goal: 'fat_loss',
      onboarding_data: {
        lifestyle: { stressLevel: 'very high', occupation: 'banking — long hours' },
        goals: { biggestStruggle: 'stress eating and skipped workouts' },
        medical: { conditions: 'mild hypertension — monitor intensity' },
      },
    }),
  },
]

export function buildCheckin(persona: PersonaDefinition): Checkin {
  const weight = typeof persona.profile.weight === 'number' ? persona.profile.weight : parseFloat(String(persona.profile.weight ?? 70))
  const scenarios: Record<CheckinScenario, Partial<Checkin> & { notes: string; coachNote: string }> = {
    lost_too_much_weight: {
      weight: weight - 1.8,
      energy_level: 5,
      hunger_level: 9,
      training_performance: 6,
      adherence_score: 8,
      notes: 'Lost 1.8kg this week — faster than expected. Very hungry and tired. All meals followed except one skipped dinner.',
      coachNote: 'Weight dropped too fast. Ease deficit slightly and protect energy.',
    },
    weight_unchanged: {
      weight,
      energy_level: 6,
      hunger_level: 6,
      training_performance: 7,
      adherence_score: 7,
      notes: 'Scale unchanged for 2 weeks. Adherence ok weekdays, weekends looser. Training felt average.',
      coachNote: 'Plateau — review calories and weekend patterns without drastic cuts.',
    },
    strength_increased: {
      weight: weight + 0.3,
      energy_level: 8,
      hunger_level: 6,
      training_performance: 9,
      adherence_score: 9,
      notes: 'All sessions completed. Main lifts up 2.5kg. Feeling strong and recovered.',
      coachNote: 'Progressive overload working — add volume carefully on weak points.',
    },
    missed_workouts: {
      weight: weight + 0.2,
      energy_level: 5,
      hunger_level: 7,
      training_performance: 5,
      adherence_score: 4,
      notes: 'Only 1 of 3 workouts done. Work/family chaos. Diet mostly on track.',
      coachNote: 'Reduce friction — shorter sessions, maintain protein despite missed training.',
    },
    poor_sleep: {
      weight: weight - 0.3,
      energy_level: 4,
      hunger_level: 8,
      training_performance: 5,
      adherence_score: 6,
      notes: 'Averaging 5h sleep. Cravings high. Skipped 1 workout due to fatigue.',
      coachNote: 'Prioritize recovery — moderate volume, address sleep hygiene and hunger.',
    },
    high_hunger: {
      weight: weight - 0.6,
      energy_level: 6,
      hunger_level: 9,
      training_performance: 7,
      adherence_score: 6,
      notes: 'Hunger very high Thu-Sun. Weekend snacking. Otherwise followed plan.',
      coachNote: 'Increase protein/fibre at meals; structure weekend meals without large deficit jump.',
    },
    low_motivation: {
      weight: weight + 0.1,
      energy_level: 5,
      hunger_level: 6,
      training_performance: 5,
      adherence_score: 5,
      notes: 'Motivation low. 2 workouts skipped. Ate out 3 times. Need simpler plan.',
      coachNote: 'Simplify adherence — fewer decisions, maintain minimum effective dose.',
    },
    excellent_adherence: {
      weight: weight - 0.5,
      energy_level: 8,
      hunger_level: 5,
      training_performance: 9,
      adherence_score: 10,
      notes: 'Perfect week — all meals and workouts. Energy great. Ready for next progression.',
      coachNote: 'Excellent adherence — progress volume or intensity as appropriate.',
    },
  }

  const s = scenarios[persona.checkinScenario]
  return {
    id: `checkin-${persona.id}`,
    client_id: persona.profile.id,
    coach_id: 'coach-qa',
    submitted_at: now,
    weight: s.weight ?? weight,
    waist: 78,
    progress_photo_front: null,
    progress_photo_side: null,
    progress_photo_back: null,
    energy_level: s.energy_level ?? 7,
    hunger_level: s.hunger_level ?? 6,
    training_performance: s.training_performance ?? 7,
    adherence_score: s.adherence_score ?? 7,
    notes: s.notes,
    coach_response: null,
    reviewed: false,
    reviewed_at: null,
    created_at: now,
  }
}

export function buildActivePlan(persona: PersonaDefinition): Plan {
  const name = persona.profile.name ?? 'Client'
  return {
    id: `plan-${persona.id}`,
    client_id: persona.profile.id,
    coach_id: 'coach-qa',
    title: `${name} Phase 1`,
    phase: 'Foundation',
    workout_plan:
      'Day 1 Upper: bench 4x8, rows 4x8, lateral raise 3x12. Day 2 Lower: squat 4x8, RDL 3x10, leg curl 3x12. Day 3 Full: push-ups 3xAMRAP, goblet squat 3x12.',
    nutrition_plan:
      'Sample day: Breakfast oats and eggs. Lunch rice dal chicken. Dinner roti paneer salad. ~2000 kcal target, 130g protein.',
    cardio_plan: '3x 30 min brisk walk',
    supplement_plan: 'Whey if needed, creatine optional',
    coach_notes: 'Focus on adherence and progressive overload',
    version: 1,
    active: true,
    delivered_at: now,
    created_at: now,
    updated_at: now,
  }
}

export function coachNoteForCheckin(persona: PersonaDefinition): string {
  return buildCheckin(persona).notes.includes('coachNote')
    ? ''
    : ({
        lost_too_much_weight: 'Weight dropped too fast. Ease deficit slightly and protect energy.',
        weight_unchanged: 'Plateau — review calories and weekend patterns without drastic cuts.',
        strength_increased: 'Progressive overload working — add volume carefully on weak points.',
        missed_workouts: 'Reduce friction — shorter sessions, maintain protein despite missed training.',
        poor_sleep: 'Prioritize recovery — moderate volume, address sleep hygiene and hunger.',
        high_hunger: 'Increase protein/fibre at meals; structure weekend meals without large deficit jump.',
        low_motivation: 'Simplify adherence — fewer decisions, maintain minimum effective dose.',
        excellent_adherence: 'Excellent adherence — progress volume or intensity as appropriate.',
      }[persona.checkinScenario])
}
