import type { InstantFeature } from '@/lib/instant-feature-access'
import {
  PLATFORM_UNLOCK_BUNDLE_PAISE,
  PLATFORM_UNLOCK_SINGLE_PAISE,
} from '@/lib/payments/platform-unlock-catalog'

export type InstantUnlockPitch = {
  eyebrow: string
  headline: string
  blurb: string
  benefits: string[]
}

export const INSTANT_FEATURE_PITCH: Record<InstantFeature, InstantUnlockPitch> = {
  tracker: {
    eyebrow: 'Add-on · Lifetime',
    headline: 'Unlock Daily tracker',
    blurb: 'Your Instant plan already includes your customised diet and workout. Tracker is optional if you want daily logging in the app.',
    benefits: [
      'Log meals, workouts, water, and steps in one place',
      'See today’s completion at a glance',
      'Stay aligned with the plan you already have',
    ],
  },
  journey: {
    eyebrow: 'Add-on · Lifetime',
    headline: 'Unlock Journey',
    blurb: 'Your Instant plan already includes your customised diet and workout. Journey is optional if you want progress history in the app.',
    benefits: [
      'Progress photos and check-in history',
      'See how your weeks stack up',
      'Keep momentum visible after delivery',
    ],
  },
  ai_chat: {
    eyebrow: 'Add-on · Lifetime',
    headline: 'Unlock Coach chat',
    blurb: 'Your Instant plan already includes your customised diet and workout. Coach chat is optional if you want in-app coaching messages.',
    benefits: [
      'Ask about meals, workouts, and what to do today',
      'Get guidance matched to your plan',
      'Message whenever you need a nudge',
    ],
  },
}

export const INSTANT_BUNDLE_PITCH: InstantUnlockPitch = {
  eyebrow: 'Best value · Lifetime',
  headline: 'Unlock Tracker, Journey & Coach chat',
  blurb: 'One payment unlocks all three platform add-ons for life. Not a monthly fee.',
  benefits: [
    'Daily tracker for meals, workouts, and habits',
    'Journey for photos and progress history',
    'Coach chat for plan questions anytime',
  ],
}

export function instantUnlockPitchForFeature(feature: InstantFeature): InstantUnlockPitch {
  return INSTANT_FEATURE_PITCH[feature]
}

export function instantBundleSavingsPaise(): number {
  return PLATFORM_UNLOCK_SINGLE_PAISE * 3 - PLATFORM_UNLOCK_BUNDLE_PAISE
}
