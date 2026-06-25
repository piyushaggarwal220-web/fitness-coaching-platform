/** Client-visible flag — controls dev tools UI visibility */
export function isTestModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TEST_MODE === 'true'
}

/** Server-only flag — must match for API seed routes */
export function isTestModeServer(): boolean {
  return process.env.TEST_MODE === 'true'
}

export function getDevAdminEmail(): string | undefined {
  return process.env.DEV_ADMIN_EMAIL?.trim() || undefined
}
