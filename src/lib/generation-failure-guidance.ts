/**
 * Coach-facing next steps when background initial plan generation fails.
 * Keep messages actionable and free of stack traces / provider internals.
 */

export type GenerationFailureGuidance = {
  code: string
  summary: string
  nextSteps: string[]
}

const GUIDANCE: Record<string, Omit<GenerationFailureGuidance, 'code'>> = {
  photo_unavailable: {
    summary: 'A required onboarding photo could not be loaded or processed for AI planning.',
    nextSteps: [
      'Open the client profile and confirm front, side, and back photos are present (required for non-female clients).',
      'Message the client and ask them to re-upload photos in the app — prefer “Take photo now”, or pick a JPEG/PNG from the gallery.',
      'After new photos are saved, tap “Retry background generation” on this page.',
      'If photos look fine but retry still fails, try generating diet/workout manually from the action cards below.',
    ],
  },
  metrics_review: {
    summary: 'Height, weight, or age looks incorrect, so auto generation is blocked.',
    nextSteps: [
      'Review the client’s height, weight, and age on their profile and correct any typos.',
      'Message the client if you need confirmation before changing values.',
      'Once metrics look realistic, tap “Retry background generation”.',
    ],
  },
  onboarding_incomplete: {
    summary: 'Onboarding answers are incomplete, so a full plan cannot be drafted yet.',
    nextSteps: [
      'Check which onboarding fields are missing on the client profile.',
      'Message the client to finish the remaining intake questions (and photos if required).',
      'When intake is complete, retry background generation.',
    ],
  },
  validation: {
    summary: 'The AI draft did not pass plan validation (often an incomplete week).',
    nextSteps: [
      'Tap “Retry background generation” first — a second pass usually completes the week.',
      'If it fails again, generate diet and workout manually from the action cards and review before delivery.',
      'Message the client only if delivery will be delayed beyond the usual window.',
    ],
  },
  configuration: {
    summary: 'AI generation is not configured in this environment.',
    nextSteps: [
      'Do not ask the client to re-upload — this is an internal setup issue.',
      'Contact the platform admin / engineering to restore AI credentials.',
      'Meanwhile, build the plan manually so the client is not blocked.',
    ],
  },
  generation_failed: {
    summary: 'AI draft generation failed. This is usually temporary.',
    nextSteps: [
      'Tap “Retry background generation”.',
      'If retry fails, generate diet and workout manually from the action cards.',
      'Message the client about the delay so they know you are on it.',
    ],
  },
}

export function getGenerationFailureGuidance(
  errorCode: string | null | undefined,
  errorMessage?: string | null
): GenerationFailureGuidance {
  const code = (errorCode || 'generation_failed').trim() || 'generation_failed'
  const known = GUIDANCE[code] ?? GUIDANCE.generation_failed
  const summary =
    errorMessage?.trim() && !/^AI draft generation failed/i.test(errorMessage)
      ? errorMessage.trim()
      : known.summary
  return {
    code,
    summary,
    nextSteps: known.nextSteps,
  }
}

export function formatGenerationFailureSubtitle(
  clientName: string,
  errorCode: string | null | undefined,
  errorMessage?: string | null
): string {
  const guidance = getGenerationFailureGuidance(errorCode, errorMessage)
  const firstStep = guidance.nextSteps[0] ?? 'Open the task for next steps.'
  return `${clientName} · ${guidance.summary} Next: ${firstStep}`
}
