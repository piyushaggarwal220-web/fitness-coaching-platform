export const BRAND_NAME = 'Lurvox'

export const BRAND_TAGLINE = 'Personal coaching that transforms'

export const BRAND_COACH_LABEL = `${BRAND_NAME} Coach`

export const BRAND_ADMIN_LABEL = `${BRAND_NAME} Admin`

/** Prefix a page heading with the Lurvox brand when it is not already present. */
export function brandTitle(title: string): string {
  if (title.includes(BRAND_NAME)) return title
  return `${BRAND_NAME} · ${title}`
}
