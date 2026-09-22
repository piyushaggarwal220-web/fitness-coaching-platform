/**
 * Short-form Fitness Reel preset + bounded edit variants.
 */

import type { VideoEditPlan } from '@/lib/jarvis/video/provider'

export const SHORT_FORM_FITNESS_REEL_PRESET = 'short_form_fitness_reel' as const
/** Canonical alias requested by product brief */
export const SHORT_FORM_FITNESS_REEL = SHORT_FORM_FITNESS_REEL_PRESET

export type VideoVariantKind = 'fast_cuts' | 'clean_educational' | 'high_retention'

export const MAX_VARIANTS_PER_JOB = 3

export type FitnessReelPresetOptions = {
  target_aspect?: '9:16' | '1:1' | '16:9'
  captions?: boolean
  remove_silence?: boolean
  duration_target_sec?: number | null
  custom_instructions?: string
  crop_strategy?: 'subject_aware' | 'center_crop' | 'unsupported'
  variants?: VideoVariantKind[]
}

export function buildShortFormFitnessReelPlan(
  overrides?: FitnessReelPresetOptions & { hooks?: string[]; clips?: VideoEditPlan['clips'] }
): VideoEditPlan & {
  preset: typeof SHORT_FORM_FITNESS_REEL_PRESET
  duration_target_sec: number | null
  crop_strategy: 'subject_aware' | 'center_crop' | 'unsupported'
  variants: VideoVariantKind[]
  subtitle_style: Record<string, unknown>
} {
  const variants = (overrides?.variants ?? []).slice(0, MAX_VARIANTS_PER_JOB)
  const duration =
    overrides?.duration_target_sec != null
      ? Math.min(60, Math.max(7, overrides.duration_target_sec))
      : null

  return {
    preset: SHORT_FORM_FITNESS_REEL_PRESET,
    target_aspect: overrides?.target_aspect ?? '9:16',
    captions: overrides?.captions !== false,
    remove_silence: overrides?.remove_silence !== false,
    hooks: overrides?.hooks ?? [],
    clips: overrides?.clips ?? [],
    duration_target_sec: duration,
    crop_strategy: overrides?.crop_strategy ?? 'subject_aware',
    variants,
    subtitle_style: {
      safe_margins: true,
      max_chars_per_line: 32,
      max_lines: 2,
      typography: 'mobile_readable',
      burn_in: 'provider_only',
    },
    notes: [
      'Short-form Fitness Reel preset',
      '9:16 / 1080×1920 target when provider supports it',
      'Remove obvious dead air only when confidence is sufficient',
      'Preserve natural speech; tighten pauses; avoid aggressive cuts that damage speech',
      'Never remove meaningful content solely to hit an arbitrary duration',
      'Target 7–60 seconds',
      overrides?.custom_instructions ? `Custom: ${overrides.custom_instructions}` : null,
    ]
      .filter(Boolean)
      .join('. '),
  }
}

export function variantEditNotes(kind: VideoVariantKind): string {
  switch (kind) {
    case 'fast_cuts':
      return 'Variant A: faster cuts, higher energy, keep speech intact.'
    case 'clean_educational':
      return 'Variant B: clean educational pacing, clearer on-screen text.'
    case 'high_retention':
      return 'Variant C: high-retention hooks and pattern interrupts without fabricating content.'
  }
}
