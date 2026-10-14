/**
 * Razorpay payment ids are case-sensitive after the prefix.
 * Phone keyboards capitalize the first letter, so a pasted `pay_…` is submitted as `Pay_…`
 * and an exact database match misses.
 */
export function canonicalRazorpayReference(raw: string): { paymentId: string | null; orderId: string | null } {
  const compact = raw.replace(/[\s\u200b\u200c\u200d\ufeff\u00a0]+/g, '')
  const payment = compact.match(/pay_([A-Za-z0-9]+)/i)
  const order = compact.match(/order_([A-Za-z0-9]+)/i)
  return {
    paymentId: payment ? `pay_${payment[1]}` : null,
    orderId: order ? `order_${order[1]}` : null,
  }
}
