/** Captured paid sale that should produce a Meta Purchase. Test checkouts are not sales. */

export function isMetaPurchaseEligibleSale(input: {
  status: string | null | undefined
  amountPaise: number | null | undefined
  razorpayPaymentId: string | null | undefined
}): boolean {
  if (input.status !== 'captured') return false
  const amount = Number(input.amountPaise)
  if (!Number.isFinite(amount) || amount <= 0) return false
  const paymentId = input.razorpayPaymentId?.trim() ?? ''
  if (!paymentId || paymentId.startsWith('test_')) return false
  return true
}
