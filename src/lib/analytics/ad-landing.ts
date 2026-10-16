/** Ad URL for the studio preview. `/studio` is the rewritten page, so reports use one path. */
export const PREVIEW_AD_PATH = '/preview1'

/** Ad URL for the purple landing preview. */
export const PREVIEW2_AD_PATH = '/preview2'

export type PreviewAdPath = typeof PREVIEW_AD_PATH | typeof PREVIEW2_AD_PATH

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

/** Only a known preview ad page may set the purchase source URL. Anything else stays on /checkout. */
export function previewAdLandingPath(value: unknown): PreviewAdPath | null {
  if (value === PREVIEW_AD_PATH || value === '/studio') return PREVIEW_AD_PATH
  if (value === PREVIEW2_AD_PATH) return PREVIEW2_AD_PATH
  return null
}
