/** Public smoke-test client shown on the Shopify homepage. Never a paying customer. */
export const PUBLIC_DEMO_CLIENT_EMAIL = 'public-demo@trial.test.local'
export const PUBLIC_DEMO_CLIENT_NAME = 'Demo Client'
export const PUBLIC_DEMO_TRY_PATH = '/try'
/** Default paid plan after the public demo (storefront “Most Popular”). */
export const PUBLIC_DEMO_START_PLAN_PATH = '/plans/6-months'
export const PUBLIC_DEMO_READ_ONLY_MESSAGE =
  'This is a view-only demo. Look around — nothing can be changed.'
export const PUBLIC_DEMO_READ_ONLY_CODE = 'public_demo_readonly'

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? '')
    .trim()
    .toLowerCase()
}

export function isPublicDemoEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === PUBLIC_DEMO_CLIENT_EMAIL
}
