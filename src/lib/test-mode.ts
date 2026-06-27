/** Production builds and runtime always reject TEST_MODE. */
function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Client-visible flag — controls test checkout UI. Never true in production. */
export function isTestModeEnabled(): boolean {
  if (isProductionEnv()) return false
  return process.env.NEXT_PUBLIC_TEST_MODE === 'true'
}

/** Server-only flag — never true in production. */
export function isTestModeServer(): boolean {
  if (isProductionEnv()) return false
  return process.env.TEST_MODE === 'true'
}

export function getDevAdminEmail(): string | undefined {
  return process.env.DEV_ADMIN_EMAIL?.trim() || undefined
}

/** Log when TEST_MODE env vars are set alongside production — they are ignored. */
export function warnIfTestModeEnvInProduction(): void {
  if (!isProductionEnv()) return
  if (process.env.TEST_MODE === 'true' || process.env.NEXT_PUBLIC_TEST_MODE === 'true') {
    console.error(
      '[security] TEST_MODE is set in production and is forcibly disabled. Remove TEST_MODE from production environment.'
    )
  }
}
