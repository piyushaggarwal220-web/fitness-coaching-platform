/** Ad URL for the studio preview. `/studio` is the rewritten page, so reports use one path. */
export const PREVIEW_AD_PATH = '/preview1'

/** Ad URL for the purple landing preview. */
export const PREVIEW2_AD_PATH = '/preview2'

/** Ad URL for the colourful coaching preview. */
export const PREVIEW3_AD_PATH = '/preview3'

/** Beige landing with the 1 month / 3 month full-access offer. */
export const PREVIEW4_AD_PATH = '/preview4'

/** Purple landing with the 1 month / 3 month full-access offer. */
export const PREVIEW5_AD_PATH = '/preview5'

/** Mixed-colour landing with the 1 month / 3 month full-access offer. */
export const PREVIEW6_AD_PATH = '/preview6'

/** Orange quiz-v3 coaching landing. Catalog prices, separate ad path. */
export const PREVIEW7_AD_PATH = '/preview7'

export type PreviewAdPath =
  | typeof PREVIEW_AD_PATH
  | typeof PREVIEW2_AD_PATH
  | typeof PREVIEW3_AD_PATH
  | typeof PREVIEW4_AD_PATH
  | typeof PREVIEW5_AD_PATH
  | typeof PREVIEW6_AD_PATH
  | typeof PREVIEW7_AD_PATH

export const PREVIEW_DROPOFF_SECTIONS = [
  { id: 'hero', key: 'p1_hero', index: 0, label: 'Hero' },
  { id: 'how', key: 'p1_how', index: 1, label: 'How it works' },
  { id: 'tracker', key: 'p1_tracker', index: 2, label: 'Tracker' },
  { id: 'included', key: 'p1_included', index: 3, label: 'Included' },
  { id: 'movements', key: 'p1_moves', index: 4, label: 'Movements' },
  { id: 'quiz', key: 'p1_quiz', index: 5, label: 'Quiz' },
  { id: 'plans', key: 'p1_plans', index: 6, label: 'Plans' },
  { id: 'results', key: 'p1_weeks', index: 7, label: 'The weeks' },
  { id: 'faq', key: 'p1_faq', index: 8, label: 'Questions' },
  { id: 'close', key: 'p1_close', index: 9, label: 'Closing offer' },
] as const

/** Sections on the purple preview. Keys stay off the homepage and preview 1 lists. */
export const PREVIEW2_DROPOFF_SECTIONS = [
  { id: 'top', key: 'p2_hero', index: 0, label: 'Hero' },
  { id: 'why', key: 'p2_why', index: 1, label: 'Tired of no results' },
  { id: 'method', key: 'p2_method', index: 2, label: 'How it works' },
  { id: 'coaching', key: 'p2_coaching', index: 3, label: 'Coaches' },
  { id: 'pricing', key: 'p2_pricing', index: 4, label: 'Plans' },
  { id: 'faq', key: 'p2_faq', index: 5, label: 'Questions' },
  { id: 'close', key: 'p2_close', index: 6, label: 'Closing offer' },
] as const

/** Sections on the colourful preview. Keys stay off the homepage and the other previews. */
export const PREVIEW3_DROPOFF_SECTIONS = [
  { id: 'top', key: 'p3_hero', index: 0, label: 'Hero' },
  { id: 'plans', key: 'p3_plans', index: 1, label: 'Plans' },
  { id: 'steps', key: 'p3_steps', index: 2, label: 'How it works' },
  { id: 'faq', key: 'p3_faq', index: 3, label: 'Questions' },
  { id: 'close', key: 'p3_close', index: 4, label: 'Closing offer' },
  { id: 'truth', key: 'p3_truth', index: 5, label: 'Truth check' },
  { id: 'changes', key: 'p3_changes', index: 6, label: 'Expected changes' },
  { id: 'quiz', key: 'p3_quiz', index: 7, label: 'Fitness quiz' },
] as const

/** Sections on the beige duration preview. */
export const PREVIEW4_DROPOFF_SECTIONS = [
  { id: 'top', key: 'p4_hero', index: 0, label: 'Hero' },
  { id: 'why', key: 'p4_why', index: 1, label: 'Why you won\'t fail' },
  { id: 'system', key: 'p4_system', index: 2, label: 'What you get' },
  { id: 'coaching', key: 'p4_coaching', index: 3, label: 'Coaches' },
  { id: 'method', key: 'p4_method', index: 4, label: 'How it works' },
  { id: 'pricing', key: 'p4_pricing', index: 5, label: 'Plans' },
  { id: 'faq', key: 'p4_faq', index: 6, label: 'Questions' },
  { id: 'close', key: 'p4_close', index: 7, label: 'Closing offer' },
] as const

/** Sections on the purple duration preview. Same layout as preview 2, separate keys. */
export const PREVIEW5_DROPOFF_SECTIONS = [
  { id: 'top', key: 'p5_hero', index: 0, label: 'Hero' },
  { id: 'why', key: 'p5_why', index: 1, label: 'Tired of no results' },
  { id: 'method', key: 'p5_method', index: 2, label: 'How it works' },
  { id: 'coaching', key: 'p5_coaching', index: 3, label: 'Coaches' },
  { id: 'pricing', key: 'p5_pricing', index: 4, label: 'Plans' },
  { id: 'faq', key: 'p5_faq', index: 5, label: 'Questions' },
  { id: 'close', key: 'p5_close', index: 6, label: 'Closing offer' },
] as const

/** Sections on the mixed-colour duration preview. */
export const PREVIEW6_DROPOFF_SECTIONS = [
  { id: 'top', key: 'p6_hero', index: 0, label: 'Hero' },
  { id: 'plans', key: 'p6_plans', index: 1, label: 'Plans' },
  { id: 'steps', key: 'p6_steps', index: 2, label: 'How it works' },
  { id: 'faq', key: 'p6_faq', index: 3, label: 'Questions' },
  { id: 'close', key: 'p6_close', index: 4, label: 'Closing offer' },
  { id: 'truth', key: 'p6_truth', index: 5, label: 'Truth check' },
  { id: 'changes', key: 'p6_changes', index: 6, label: 'Expected changes' },
  { id: 'quiz', key: 'p6_quiz', index: 7, label: 'Fitness quiz' },
] as const

/** Sections on the orange quiz-v3 preview. Keys stay off the other landings. */
export const PREVIEW7_DROPOFF_SECTIONS = [
  { id: 'top', key: 'p7_hero', index: 0, label: 'Hero' },
  { id: 'plans', key: 'p7_plans', index: 1, label: 'Plans' },
  { id: 'truth', key: 'p7_truth', index: 2, label: 'Truth check' },
  { id: 'steps', key: 'p7_steps', index: 3, label: 'How it works' },
  { id: 'faq', key: 'p7_faq', index: 4, label: 'Questions' },
  { id: 'close', key: 'p7_close', index: 5, label: 'Closing offer' },
  { id: 'quiz', key: 'p7_quiz', index: 6, label: 'Fitness quiz' },
] as const

/** Only a known preview ad page may set the purchase source URL. Anything else stays on /checkout. */
export function previewAdLandingPath(value: unknown): PreviewAdPath | null {
  if (value === PREVIEW_AD_PATH || value === '/studio') return PREVIEW_AD_PATH
  if (value === PREVIEW2_AD_PATH) return PREVIEW2_AD_PATH
  if (value === PREVIEW3_AD_PATH) return PREVIEW3_AD_PATH
  if (value === PREVIEW4_AD_PATH) return PREVIEW4_AD_PATH
  if (value === PREVIEW5_AD_PATH) return PREVIEW5_AD_PATH
  if (value === PREVIEW6_AD_PATH) return PREVIEW6_AD_PATH
  if (value === PREVIEW7_AD_PATH) return PREVIEW7_AD_PATH
  return null
}

export function previewAdFunnelSource(
  path: PreviewAdPath
): 'preview1' | 'preview2' | 'preview3' | 'preview4' | 'preview5' | 'preview6' | 'preview7' {
  if (path === PREVIEW2_AD_PATH) return 'preview2'
  if (path === PREVIEW3_AD_PATH) return 'preview3'
  if (path === PREVIEW4_AD_PATH) return 'preview4'
  if (path === PREVIEW5_AD_PATH) return 'preview5'
  if (path === PREVIEW6_AD_PATH) return 'preview6'
  if (path === PREVIEW7_AD_PATH) return 'preview7'
  return 'preview1'
}
