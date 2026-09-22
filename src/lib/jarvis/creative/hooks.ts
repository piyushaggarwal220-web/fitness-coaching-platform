/**
 * Hook engine — footage-compatible hooks with claim flags.
 * Never invents unsupported statistics or fake source support.
 */

import type { ConfidenceLevel } from '@/lib/jarvis/video/intelligence/types'
import type { CreativeHook, HookCategory } from '@/lib/jarvis/creative/types'
import { flagUnsupportedClaims } from '@/lib/jarvis/creative/claims'

function categorizeHook(text: string): HookCategory {
  const t = text.toLowerCase()
  if (/\?/.test(t)) return 'QUESTION'
  if (/myth|lie|false|isn't true/.test(t)) return 'MYTH'
  if (/mistake|wrong|doing this/.test(t)) return 'MISTAKE'
  if (/don't|never|stop|warning|careful/.test(t)) return 'WARNING'
  if (/most people|everyone thinks|contrary/.test(t)) return 'CONTRARIAN'
  if (/\d+%|\d+\s*(kg|lbs|days|weeks)/.test(t)) return 'SPECIFIC_NUMBER'
  if (/story|i used to|when i/.test(t)) return 'STORY'
  if (/pain|struggle|stuck|frustrated/.test(t)) return 'PAIN_POINT'
  if (/challenge|try this|for 7 days/.test(t)) return 'CHALLENGE'
  if (/result|lost|gained|transformed/.test(t)) return 'RESULT'
  if (/coach|science|research|expert/.test(t)) return 'AUTHORITY'
  return 'CURIOSITY'
}

/**
 * Prefer spoken footage as the hook when available.
 * Alternate hooks that diverge from footage are marked missing_footage.
 */
export function buildHookFromFootage(input: {
  spokenExcerpt: string | null
  ideaHint?: string | null
  allowRewrite?: boolean
}): CreativeHook {
  const spoken = (input.spokenExcerpt || '').trim()
  if (spoken) {
    const claim_flags = flagUnsupportedClaims(spoken)
    return {
      text: spoken.length > 120 ? `${spoken.slice(0, 117)}…` : spoken,
      type: categorizeHook(spoken),
      reason: 'Derived from spoken footage transcript excerpt',
      confidence: claim_flags.length ? 'medium' : 'high',
      source_support: true,
      source_excerpt: spoken.slice(0, 240),
      missing_footage: false,
      claim_flags,
    }
  }

  const hint = (input.ideaHint || '').trim()
  if (hint && input.allowRewrite) {
    const text = hint.endsWith('?') || hint.length > 20 ? hint : `Why ${hint} keeps failing`
    const claim_flags = flagUnsupportedClaims(text)
    return {
      text: text.slice(0, 160),
      type: categorizeHook(text),
      reason: 'Suggested from user idea — not spoken in footage (NEW_RECORDING or overlay)',
      confidence: 'low',
      source_support: false,
      source_excerpt: null,
      missing_footage: true,
      claim_flags,
    }
  }

  return {
    text: 'Hook requires footage or a clearer idea',
    type: 'CURIOSITY',
    reason: 'No spoken excerpt or idea available',
    confidence: 'low',
    source_support: false,
    source_excerpt: null,
    missing_footage: true,
    claim_flags: [],
  }
}

/** Generate distinct hook variants that stay grounded when footage exists. */
export function generateHookVariants(input: {
  baseSpoken: string | null
  topic: string
  max?: number
}): CreativeHook[] {
  const max = Math.min(input.max ?? 3, 5)
  const spoken = (input.baseSpoken || '').trim()
  const variants: CreativeHook[] = []

  if (spoken) {
    variants.push(buildHookFromFootage({ spokenExcerpt: spoken }))
    // Mild category reframes that still cite the same evidence
    const lower = spoken.toLowerCase()
    if (!/\?/.test(spoken) && variants.length < max) {
      const q = spoken.replace(/[.!]+$/, '') + '?'
      variants.push({
        ...buildHookFromFootage({ spokenExcerpt: q }),
        type: 'QUESTION',
        reason: 'Question form of the same spoken line',
      })
    }
    if (/mistake|wrong|underestimat/.test(lower) && variants.length < max) {
      variants.push({
        text: spoken.slice(0, 160),
        type: 'MISTAKE',
        reason: 'Same footage framed as mistake category',
        confidence: 'high' as ConfidenceLevel,
        source_support: true,
        source_excerpt: spoken.slice(0, 240),
        missing_footage: false,
        claim_flags: flagUnsupportedClaims(spoken),
      })
    }
  } else {
    variants.push(
      buildHookFromFootage({
        spokenExcerpt: null,
        ideaHint: input.topic,
        allowRewrite: true,
      })
    )
  }

  // Deduplicate by normalized text
  const seen = new Set<string>()
  return variants.filter((v) => {
    const key = v.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, max)
}
