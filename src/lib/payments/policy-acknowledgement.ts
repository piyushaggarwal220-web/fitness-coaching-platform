import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  REFUND_POLICY_VERSION,
  TERMS_POLICY_VERSION,
  type CheckoutPolicyAcknowledgement,
} from '@/lib/policies'

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || null
}

export function createPolicyAcknowledgement(request: Request): CheckoutPolicyAcknowledgement {
  const ip = requestIp(request)
  const salt = process.env.POLICY_ACK_IP_SALT?.trim() || process.env.RAZORPAY_KEY_SECRET?.trim()

  return {
    termsVersion: TERMS_POLICY_VERSION,
    refundPolicyVersion: REFUND_POLICY_VERSION,
    acknowledgedAt: new Date().toISOString(),
    // Never persist a raw network address. A deployment-specific salt prevents
    // this value from becoming a portable identifier.
    ipHash: ip && salt ? createHash('sha256').update(`${salt}:${ip}`).digest('hex') : null,
  }
}

export async function storeOrderPolicyAcknowledgement(
  admin: SupabaseClient,
  orderId: string,
  acknowledgement: CheckoutPolicyAcknowledgement
): Promise<void> {
  const { error } = await admin.from('payment_order_acknowledgements').insert({
    razorpay_order_id: orderId,
    terms_policy_version: acknowledgement.termsVersion,
    refund_policy_version: acknowledgement.refundPolicyVersion,
    acknowledged_at: acknowledgement.acknowledgedAt,
    ip_hash: acknowledgement.ipHash,
  })
  if (error) throw new Error(`Failed to store policy acknowledgement: ${error.message}`)
}

export async function getOrderPolicyAcknowledgement(
  admin: SupabaseClient,
  orderId: string
): Promise<CheckoutPolicyAcknowledgement | null> {
  const { data, error } = await admin
    .from('payment_order_acknowledgements')
    .select('terms_policy_version, refund_policy_version, acknowledged_at, ip_hash')
    .eq('razorpay_order_id', orderId)
    .maybeSingle()

  if (error) throw new Error(`Failed to verify policy acknowledgement: ${error.message}`)
  if (!data) return null

  return {
    termsVersion: data.terms_policy_version,
    refundPolicyVersion: data.refund_policy_version,
    acknowledgedAt: data.acknowledged_at,
    ipHash: data.ip_hash,
  }
}
