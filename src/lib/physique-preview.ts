/** Public plan preview: one personalised illustration per visitor per day. */

export const PHYSIQUE_PREVIEW_PLANS = {
  '3_months': {
    slug: '3_months',
    name: 'Fat loss',
    price: '₹599',
    checkoutUrl: 'https://app.lurvox.in/checkout?plan=3_months',
    change:
      'a realistic 3-month fat-loss change: a slightly slimmer waist and a little less body fat, with arms and shoulders almost the same',
  },
  '6_months': {
    slug: '6_months',
    name: 'Fat loss + muscle',
    price: '₹999',
    checkoutUrl: 'https://app.lurvox.in/checkout?plan=6_months',
    change:
      'a realistic 6-month fat-loss plus muscle change: a slimmer waist and slightly fuller shoulders and arms, athletic but not a bodybuilder',
  },
  '12_months': {
    slug: '12_months',
    name: 'Athletic body',
    price: '₹1,699',
    checkoutUrl: 'https://app.lurvox.in/checkout?plan=12_months',
    change:
      'a realistic 12-month athletic change: a leaner waist, broader shoulders, and more defined arms, still a normal person after a year of training, not a competition bodybuilder',
  },
} as const

export type PhysiquePreviewPlanSlug = keyof typeof PHYSIQUE_PREVIEW_PLANS

export const PHYSIQUE_PREVIEWS_PER_DAY = 1
export const PHYSIQUE_PREVIEW_MAX_BYTES = 4 * 1024 * 1024

const VISITOR_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPhysiquePreviewPlan(value: string): value is PhysiquePreviewPlanSlug {
  return value in PHYSIQUE_PREVIEW_PLANS
}

export function isVisitorId(value: string): boolean {
  return VISITOR_ID_RE.test(value)
}

export function physiquePreviewPrompt(plan: PhysiquePreviewPlanSlug): string {
  const spec = PHYSIQUE_PREVIEW_PLANS[plan]
  return [
    'Edit this photo of one adult.',
    'Keep the same person, face, pose, clothing, and background.',
    `Show ${spec.change}.`,
    'Keep them in normal gym clothes. Do not make them shirtless, nude, or sexualised.',
    'If the torso is bare, add a plain athletic t-shirt.',
    'Do not add text, logos, or watermarks.',
  ].join(' ')
}

/** Only an exact "allow" from the safety check may proceed. Anything else is a refusal. */
export function parseSafetyDecision(text: string): 'allow' | 'refuse' {
  const first = text.trim().toLowerCase().split(/\s+/)[0] ?? ''
  return first === 'allow' ? 'allow' : 'refuse'
}

export function sniffPreviewMediaType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

/** Calendar day in India, so the daily limit resets at midnight IST. */
export function physiquePreviewDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
}
