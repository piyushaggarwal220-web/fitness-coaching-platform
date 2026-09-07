/** Public smoke-test client shown on the Shopify homepage. Never a paying customer. */
export const PUBLIC_DEMO_CLIENT_EMAIL = 'public-demo@trial.test.local'
export const PUBLIC_DEMO_CLIENT_NAME = 'Aarav Sharma'
export const PUBLIC_DEMO_TRY_PATH = '/try'
export const PUBLIC_DEMO_READ_ONLY_MESSAGE =
  'This is a view-only demo account. You can look around — nothing can be changed.'
export const PUBLIC_DEMO_READ_ONLY_CODE = 'public_demo_readonly'

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? '')
    .trim()
    .toLowerCase()
}

export function isPublicDemoEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === PUBLIC_DEMO_CLIENT_EMAIL
}
