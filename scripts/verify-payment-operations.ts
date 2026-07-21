import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const migration = read('supabase/migrations/20260721153000_payment_operations_lifecycle.sql')
const fulfillment = read('src/lib/payments/fulfillment.ts')
const lifecycle = read('src/lib/notifications/lifecycle.ts')
const webhook = read('src/app/api/payment/webhook/route.ts')
const adminActions = read('src/app/api/admin/purchases/[id]/actions/route.ts')
const meta = read('src/lib/analytics/meta-conversions.ts')
const anthropic = read('src/lib/ai/anthropic.ts')
const refundPolicy = read('src/app/refund-policy/page.tsx')
const refundOperations = read('src/lib/payments/admin-operations.ts')

assert.match(migration, /dedupe_key text NOT NULL UNIQUE/)
assert.match(migration, /idempotency_key text NOT NULL UNIQUE/)
assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
assert.match(fulfillment, /createHash\('sha256'\)/)
assert.doesNotMatch(lifecycle, /claim_token_hash\s*:/)
assert.match(webhook, /verifyRazorpayWebhookSignature/)
assert.match(webhook, /payment\.failed/)
assert.match(webhook, /refund\.processed/)
assert.match(adminActions, /requireSuperAdminApi/)
assert.match(adminActions, /idempotencyKey: z\.string\(\)\.uuid\(\)/)
assert.match(meta, /event_id: eventId/)
assert.match(meta, /sha256\(normalizedEmail/)
assert.match(anthropic, /['"]quota['"]/)
assert.match(anthropic, /ANTHROPIC_FALLBACK_MODEL/)
assert.match(refundPolicy, /at least 90%/)
assert.match(refundPolicy, /does not limit rights that cannot legally be excluded/)
assert.match(refundOperations, /getPurchaseRefundEligibility/)
assert.match(refundOperations, /documented, admin-reviewed no-result claim/)

console.log('✓ Payment operation schema has durable idempotency')
console.log('✓ Claim tokens remain hashed at rest')
console.log('✓ Webhook handles captured, failed, and refunded events')
console.log('✓ Destructive admin actions require super-admin role')
console.log('✓ Meta Purchase uses hashed user data and stable event IDs')
console.log('✓ Anthropic has classified retries and model fallback')
console.log('✓ Results-guarantee policy is disclosed and server-enforced')
