import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const source = async (relativePath: string) =>
  readFile(path.join(root, relativePath), 'utf8')

const [
  redeemRoute,
  redemption,
  fulfillment,
  resolveQueue,
  chatRoute,
  chatComposer,
  trackerService,
  trackerContext,
] = await Promise.all([
  source('src/app/api/redemption/redeem/route.ts'),
  source('src/lib/redemption-codes.ts'),
  source('src/lib/payments/fulfillment.ts'),
  source('src/lib/coach-work-queue-resolve.ts'),
  source('src/app/api/chat/messages/route.ts'),
  source('src/components/chat/CoachChatThread.tsx'),
  source('src/lib/daily-tracker/service.ts'),
  source('src/components/tracker/context/TrackerContext.tsx'),
])

assert.match(redeemRoute, /requireApiUser\(\)/)
assert.match(redeemRoute, /auth\.user\.email\.trim\(\)\.toLowerCase\(\) !== normalizedEmail/)
assert.match(redeemRoute, /userId: auth\.user\.id/)
assert.doesNotMatch(redeemRoute, /establishPurchaseSession/)
console.log('✓ Redemption requires an authenticated matching email')

assert.match(redemption, /\.eq\('remaining_uses', current\.remaining_uses\)/)
assert.match(redemption, /const consumed = await reserveRedemptionUse/)
assert.ok(
  redemption.indexOf('const consumed = await reserveRedemptionUse') <
    redemption.indexOf('payment_confirmed: true'),
  'redemption must reserve capacity before granting entitlement'
)
assert.doesNotMatch(redemption, /role: 'client',[\s\S]{0,180}onboarding_complete: false/)
console.log('✓ Redemption capacity is reserved atomically without resetting profiles')

const existingUserClaim = fulfillment.slice(
  fulfillment.indexOf('if (userId) {'),
  fulfillment.indexOf('} else {', fulfillment.indexOf('if (userId) {')) + 8
)
assert.match(existingUserClaim, /if \(claimedViaToken\)/)
assert.doesNotMatch(existingUserClaim, /onboarding_complete !== true/)
console.log('✓ Receipt-only claims cannot replace existing credentials')

const issueCase = resolveQueue.slice(
  resolveQueue.indexOf("case 'issue_report'"),
  resolveQueue.indexOf("case 'initial_plan'")
)
assert.match(issueCase, /\.select\('coach_id'\)/)
assert.match(issueCase, /profile\.coach_id !== coachId/)
assert.match(issueCase, /\.eq\('client_id', issue\.client_id\)/)
console.log('✓ Issue resolution verifies coach assignment')

assert.match(chatRoute, /new Set\(\['text', 'voice', 'image'\]\)/)
assert.match(chatRoute, /if \(!USER_MESSAGE_TYPES\.has\(messageType\)\)/)
assert.doesNotMatch(chatRoute, /'text' \| 'voice' \| 'image' \| 'system'/)
console.log('✓ User chat messages reject the system message type')

assert.match(chatComposer, /if \(imagePreview\) void uploadAndSendImage\(\)/)
assert.match(chatComposer, /disabled=\{sending\}/)
console.log('✓ Primary chat send control preserves image attachments')

const trackerUpdate = trackerService.slice(
  trackerService.indexOf('export async function updateTrackerCompletion'),
  trackerService.indexOf('export async function refreshTodayTrackerAfterPlanPublish')
)
assert.match(trackerUpdate, /for \(let attempt = 0; attempt < 5; attempt \+= 1\)/)
assert.match(trackerUpdate, /\.eq\('updated_at', previousUpdatedAt\)/)
assert.match(trackerContext, /saveQueueRef\.current\.then\(save, save\)/)
console.log('✓ Tracker writes retry conflicts and client saves are serialized')
