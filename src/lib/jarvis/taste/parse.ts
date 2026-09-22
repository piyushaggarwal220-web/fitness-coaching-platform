/**
 * Deterministic feedback / instruction → taste signals.
 * Prefer deterministic extraction over LLM.
 * "Keep everything else the same" is revision-only — NOT a preference.
 */

import type {
  TasteDirection,
  TastePolarity,
  TasteScope,
  TasteSignal,
} from '@/lib/jarvis/taste/types'

const SENSITIVE =
  /\b(personality|psychology|emotional|politic\w*|religio\w*|race|gender|sexual|mental health|depression|anxiety disorder)\b/i

export function isSensitiveInferenceAttempt(text: string): boolean {
  return SENSITIVE.test(text)
}

export function isRevisionOnlyInstruction(text: string): boolean {
  const t = text.toLowerCase()
  return /keep everything else|keep the rest|only (?:for )?this|for this (?:video|reel|edit)|just this once/.test(
    t
  )
}

/**
 * Parse user feedback into zero or more taste signals.
 * Does not invent caption style details when "these captions" is ambiguous.
 */
export function parseTasteFeedback(
  feedback: string,
  opts?: { scope?: TasteScope; default_scope?: TasteScope }
): TasteSignal[] {
  const raw = feedback.trim()
  if (!raw) return []
  if (isSensitiveInferenceAttempt(raw)) {
    return [
      {
        dimension: 'CONTENT',
        preference_key: 'blocked_sensitive',
        preference_value: 'blocked',
        polarity: 'NEUTRAL',
        direction: 'NEUTRAL',
        evidence_type: 'EXPLICIT_FEEDBACK',
        confidence: 0,
        signal: 'SENSITIVE_INFERENCE_BLOCKED',
        scope: opts?.scope || opts?.default_scope || 'GLOBAL',
        is_revision_only: true,
        is_hard_constraint: false,
        skip_learning: true,
        note: 'Sensitive inference blocked — creative production preferences only.',
      },
    ]
  }

  const f = raw.toLowerCase()
  const scope = opts?.scope || opts?.default_scope || 'GLOBAL'
  const revisionOnly = isRevisionOnlyInstruction(raw)
  const signals: TasteSignal[] = []

  // "Keep everything else" alone — not a preference
  if (
    revisionOnly &&
    !/zoom|caption|hook|cta|text|pace|fast|slow|music|overlay/.test(f)
  ) {
    return [
      {
        dimension: 'EDITING',
        preference_key: 'revision_preserve',
        preference_value: 'preserve_rest',
        polarity: 'NEUTRAL',
        direction: 'NEUTRAL',
        evidence_type: 'USER_INSTRUCTION',
        confidence: 0,
        signal: 'REVISION_ONLY',
        scope,
        is_revision_only: true,
        is_hard_constraint: false,
        skip_learning: true,
        note: 'Current-revision instruction only — not a durable preference.',
      },
    ]
  }

  const hard =
    /(?:never|always)\b/.test(f) ||
    /please (?:always|never)/.test(f) ||
    /^remember that/.test(f)

  // Zooms
  if (/zoom/.test(f)) {
    const decrease =
      /too many|remove|less|fewer|no |don't|do not|restrain|minimal|hate/.test(f)
    const increase = /dramatic zoom|add (?:a )?zoom|more zoom|use.*zoom/.test(f)
    if (decrease || increase) {
      signals.push({
        dimension: 'EDITING',
        preference_key: 'zoom_frequency',
        preference_value: decrease ? 'restrained' : 'dramatic_allowed',
        polarity: decrease ? 'DECREASE' : 'INCREASE',
        direction: decrease ? 'DECREASE' : 'INCREASE',
        evidence_type: hard ? 'USER_INSTRUCTION' : 'EXPLICIT_FEEDBACK',
        confidence: hard ? 0.5 : 0.35,
        signal: decrease ? 'REDUCE_ZOOM' : 'ALLOW_ZOOM',
        scope: revisionOnly && increase ? 'HOOK' : scope,
        is_revision_only: revisionOnly && !hard,
        is_hard_constraint: hard && decrease,
        skip_learning: false,
        note: decrease
          ? 'User signal to reduce zoom usage'
          : 'User allows/wants zoom in this context',
      })
    }
  }

  // Captions
  if (/caption/.test(f)) {
    const like = /like|love|good|perfect|keep these/.test(f)
    const reduce = /too many|fewer|less|minimal|smaller|don't|do not|so many/.test(f)
    const enlarge = /huge|larger|bigger|make.*caption/.test(f)
    if (reduce) {
      signals.push({
        dimension: 'CAPTIONS',
        preference_key: 'caption_density',
        preference_value: 'minimal',
        polarity: 'DECREASE',
        direction: 'DECREASE',
        evidence_type: hard ? 'USER_INSTRUCTION' : 'EXPLICIT_FEEDBACK',
        confidence: hard ? 0.5 : 0.35,
        signal: 'REDUCE_CAPTIONS',
        scope,
        is_revision_only: revisionOnly && !hard,
        is_hard_constraint: hard,
        skip_learning: false,
        note: 'Reduce caption density',
      })
    } else if (enlarge) {
      signals.push({
        dimension: 'CAPTIONS',
        preference_key: 'caption_size',
        preference_value: 'large',
        polarity: 'INCREASE',
        direction: 'INCREASE',
        evidence_type: 'EXPLICIT_FEEDBACK',
        confidence: revisionOnly ? 0.25 : 0.35,
        signal: 'LARGER_CAPTIONS',
        scope: revisionOnly ? 'CREATIVE' : scope,
        is_revision_only: revisionOnly,
        is_hard_constraint: false,
        skip_learning: false,
        note: revisionOnly
          ? 'Current-video caption size instruction'
          : 'Prefer larger captions',
      })
    } else if (like) {
      // Ambiguous "I like these captions" — positive but low confidence
      signals.push({
        dimension: 'CAPTIONS',
        preference_key: 'caption_style',
        preference_value: 'liked_current',
        polarity: 'PREFER',
        direction: 'POSITIVE',
        evidence_type: 'EXPLICIT_FEEDBACK',
        confidence: 0.2,
        signal: 'CAPTIONS_POSITIVE_AMBIGUOUS',
        scope,
        is_revision_only: false,
        is_hard_constraint: false,
        skip_learning: false,
        note: 'Positive caption feedback without identifiable properties — low confidence',
      })
    }
  }

  // Hook pacing
  if (/hook|first (?:two|2) seconds|opening/.test(f) && /fast|slow|short|long|speed/.test(f)) {
    const faster = /fast|short|quicker|speed up/.test(f)
    signals.push({
      dimension: 'PACING',
      preference_key: 'hook_pace',
      preference_value: faster ? 'fast' : 'slow',
      polarity: faster ? 'INCREASE' : 'DECREASE',
      direction: (faster ? 'FASTER' : 'SLOWER') as TasteDirection,
      evidence_type: 'EXPLICIT_FEEDBACK',
      confidence: 0.35,
      signal: faster ? 'FASTER_HOOK' : 'SLOWER_HOOK',
      scope: 'HOOK',
      is_revision_only: revisionOnly,
      is_hard_constraint: false,
      skip_learning: false,
      note: 'Hook pacing signal',
    })
  }

  // CTA
  if (/\bcta\b|call to action/.test(f)) {
    if (/remove|no cta|drop/.test(f)) {
      signals.push({
        dimension: 'CTA',
        preference_key: 'cta_presence',
        preference_value: 'optional',
        polarity: 'AVOID',
        direction: 'AVOID',
        evidence_type: 'EXPLICIT_FEEDBACK',
        confidence: 0.3,
        signal: 'REDUCE_CTA',
        scope: revisionOnly ? 'CREATIVE' : scope,
        is_revision_only: revisionOnly,
        is_hard_constraint: false,
        skip_learning: false,
        note: 'CTA reduction signal',
      })
    } else if (/soft|gentle/.test(f)) {
      signals.push({
        dimension: 'CTA',
        preference_key: 'cta_tone',
        preference_value: 'soft',
        polarity: 'PREFER',
        direction: 'PREFER',
        evidence_type: 'EXPLICIT_FEEDBACK',
        confidence: 0.35,
        signal: 'SOFT_CTA',
        scope,
        is_revision_only: false,
        is_hard_constraint: false,
        skip_learning: false,
        note: 'Prefer soft CTA',
      })
    }
  }

  // Text overlays
  if (/text|overlay/.test(f) && /less|fewer|minimal|so many|too much/.test(f)) {
    signals.push({
      dimension: 'TEXT',
      preference_key: 'text_density',
      preference_value: 'minimal',
      polarity: 'DECREASE',
      direction: 'DECREASE',
      evidence_type: 'EXPLICIT_FEEDBACK',
      confidence: 0.35,
      signal: 'MINIMAL_TEXT',
      scope,
      is_revision_only: revisionOnly,
      is_hard_constraint: hard,
      skip_learning: false,
      note: 'Prefer minimal text overlays',
    })
  }

  // Vague complaints — no durable taste
  if (
    !signals.length &&
    /^(i don't like this|this is bad|no|nah|wrong|hate it|not good)[.!]?$/i.test(raw)
  ) {
    return [
      {
        dimension: 'CONTENT',
        preference_key: 'vague_rejection',
        preference_value: 'unspecified',
        polarity: 'NEUTRAL',
        direction: 'NEGATIVE',
        evidence_type: 'EXPLICIT_FEEDBACK',
        confidence: 0.05,
        signal: 'VAGUE_REJECTION',
        scope,
        is_revision_only: true,
        is_hard_constraint: false,
        skip_learning: true,
        note: 'Vague rejection — weak evidence only, no preference invented.',
      },
    ]
  }

  // Scope hints
  for (const s of signals) {
    if (/only for reels|instagram reel/i.test(f)) s.scope = 'INSTAGRAM_REEL'
    if (/educational/i.test(f)) s.scope = 'EDUCATIONAL'
    if (/transform/i.test(f)) s.scope = 'TRANSFORMATION'
    if (revisionOnly && !hard) {
      s.is_revision_only = true
      s.note = `${s.note} (current instruction may override stored taste)`
    }
  }

  return signals
}

export function polarityFromDirection(d: TasteDirection): TastePolarity {
  switch (d) {
    case 'INCREASE':
    case 'FASTER':
      return 'INCREASE'
    case 'DECREASE':
    case 'SLOWER':
      return 'DECREASE'
    case 'AVOID':
      return 'AVOID'
    case 'PREFER':
    case 'POSITIVE':
      return 'PREFER'
    case 'NEGATIVE':
      return 'AVOID'
    default:
      return 'NEUTRAL'
  }
}
