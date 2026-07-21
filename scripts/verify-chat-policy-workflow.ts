import assert from 'node:assert/strict'
import { getCoachResponseTarget, COACH_RESPONSE_TARGET_MS } from '../src/lib/chat-response-target'
import {
  isCurrentPolicyAcknowledgement,
  REFUND_POLICY_VERSION,
  TERMS_POLICY_VERSION,
} from '../src/lib/policies'
import type { ConversationMessage } from '../src/types/database'

function message(
  id: string,
  sender: 'client' | 'coach',
  createdAt: string
): ConversationMessage {
  return {
    id,
    conversation_id: 'conversation',
    sender_type: sender,
    sender_id: id,
    message_type: 'text',
    content: id,
    media_url: null,
    media_duration_seconds: null,
    read_at: null,
    created_at: createdAt,
  }
}

const first = '2026-07-21T10:00:00.000Z'
const target = getCoachResponseTarget([
  message('client-1', 'client', first),
  message('client-2', 'client', '2026-07-21T10:30:00.000Z'),
])
assert(target)
assert.equal(target.startedAt, Date.parse(first), 'first unanswered message anchors the target')
assert.equal(target.deadline, Date.parse(first) + COACH_RESPONSE_TARGET_MS)
assert.equal(target.unansweredCount, 2, 'additional messages share the active target')

assert.equal(
  getCoachResponseTarget([
    message('client-1', 'client', first),
    message('coach-1', 'coach', '2026-07-21T10:05:00.000Z'),
  ]),
  null,
  'a later coach reply clears the target'
)

assert.equal(
  isCurrentPolicyAcknowledgement({
    termsVersion: TERMS_POLICY_VERSION,
    refundPolicyVersion: REFUND_POLICY_VERSION,
    acknowledgedAt: new Date().toISOString(),
    ipHash: null,
  }),
  true
)
assert.equal(
  isCurrentPolicyAcknowledgement({
    termsVersion: 'old',
    refundPolicyVersion: REFUND_POLICY_VERSION,
    acknowledgedAt: new Date().toISOString(),
  }),
  false,
  'stale policy versions are rejected'
)

console.log('✓ policy versions and acknowledgement enforcement')
console.log('✓ response target, multiple-message, and coach-reply behavior')
