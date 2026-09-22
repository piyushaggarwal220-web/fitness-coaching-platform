/**
 * Factual claim flags for fitness creative copy.
 * Flags unsupported absolute / medical claims — does not auto-rewrite into "facts".
 */

const UNSUPPORTED_PATTERNS: Array<{ re: RegExp; flag: string }> = [
  {
    re: /\b(90%|95%|99%|everyone|all people|nobody)\b/i,
    flag: 'UNSUPPORTED_ABSOLUTE_OR_STATISTIC',
  },
  {
    re: /\bscientists (proved|proven|confirmed)\b/i,
    flag: 'UNSUPPORTED_SCIENCE_CLAIM',
  },
  {
    re: /\bburns?\s+(belly|spot)\s+fat\b/i,
    flag: 'SPOT_REDUCTION_CLAIM_REVIEW_REQUIRED',
  },
  {
    re: /\b(cure|guaranteed|overnight|miracle)\b/i,
    flag: 'MEDICAL_OR_GUARANTEE_CLAIM_REVIEW_REQUIRED',
  },
  {
    re: /\bdetox(es|ify)?\b/i,
    flag: 'DETOX_CLAIM_REVIEW_REQUIRED',
  },
]

export function flagUnsupportedClaims(text: string): string[] {
  const flags: string[] = []
  for (const p of UNSUPPORTED_PATTERNS) {
    if (p.re.test(text) && !flags.includes(p.flag)) flags.push(p.flag)
  }
  return flags
}

export function collectClaimFlags(texts: string[]): string[] {
  const out: string[] = []
  for (const t of texts) {
    for (const f of flagUnsupportedClaims(t)) {
      if (!out.includes(f)) out.push(f)
    }
  }
  return out
}
