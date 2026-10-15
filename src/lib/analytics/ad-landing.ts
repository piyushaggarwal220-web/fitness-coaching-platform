/** Ad URL for the studio preview. `/studio` is the rewritten page, so reports use one path. */
export const PREVIEW_AD_PATH = '/preview1'

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

/** Only the preview ad page may set the purchase source URL. Anything else stays on /checkout. */
export function previewAdLandingPath(value: unknown): typeof PREVIEW_AD_PATH | null {
  if (value === PREVIEW_AD_PATH || value === '/studio') return PREVIEW_AD_PATH
  return null
}
