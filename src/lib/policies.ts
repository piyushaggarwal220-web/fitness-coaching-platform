export const TERMS_POLICY_VERSION = '2026-07-21'
export const REFUND_POLICY_VERSION = '2026-07-21'

export type CheckoutPolicyAcknowledgement = {
  termsVersion: string
  refundPolicyVersion: string
  acknowledgedAt: string
  ipHash: string | null
}

export function isCurrentPolicyAcknowledgement(
  value: Partial<CheckoutPolicyAcknowledgement> | null | undefined
): value is CheckoutPolicyAcknowledgement {
  return Boolean(
    value &&
      value.termsVersion === TERMS_POLICY_VERSION &&
      value.refundPolicyVersion === REFUND_POLICY_VERSION &&
      value.acknowledgedAt
  )
}
