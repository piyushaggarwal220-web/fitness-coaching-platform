/** Diagnostic logging for checkout → account → sign-in. Enable in prod with PURCHASE_FLOW_DEBUG=1 */
export function logPurchaseStep(
  step:
    | 'payment_verified'
    | 'fulfillment_started'
    | 'auth_user_created'
    | 'auth_user_exists'
    | 'auth_user_create_failed'
    | 'password_sync'
    | 'password_sync_failed'
    | 'profile_created'
    | 'profile_create_failed'
    | 'entitlement_granted'
    | 'purchase_recorded'
    | 'fulfillment_complete'
    | 'fulfillment_failed'
    | 'automatic_sign_in_started'
    | 'automatic_sign_in_succeeded'
    | 'automatic_sign_in_failed',
  details?: Record<string, unknown>
): void {
  const enabled =
    process.env.NODE_ENV !== 'production' || process.env.PURCHASE_FLOW_DEBUG === '1'

  if (!enabled) return

  const payload = details ? ` ${JSON.stringify(details)}` : ''
  console.log(`[purchase-flow] ${step}${payload}`)
}
