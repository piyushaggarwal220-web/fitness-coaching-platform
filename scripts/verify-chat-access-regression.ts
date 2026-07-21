import assert from 'node:assert/strict'
import { authorizeConversationParticipant } from '../src/lib/chat-access'
import { decideCoachSession } from '../src/lib/coach-session'
import { resolveDetectedRole } from '../src/lib/session-restore'
import type { CoachConversation } from '../src/types/database'

const conversation: CoachConversation = {
  id: 'e6d47a35-ad54-46d6-95c4-c83b72729572',
  client_id: 'client-user',
  coach_id: 'coach-row',
  status: 'active',
  unread_by_client: 0,
  unread_by_coach: 0,
  last_message_at: null,
  last_message_preview: null,
  client_typing_at: null,
  coach_typing_at: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
}

function fakeAdmin(input: {
  conversation?: CoachConversation | null
  conversationError?: string
  coachId?: string | null
  coachError?: string
}) {
  return {
    from(table: string) {
      const result = table === 'coach_conversations'
        ? {
            data: input.conversation ?? null,
            error: input.conversationError ? { message: input.conversationError } : null,
          }
        : {
            data: input.coachId ? { id: input.coachId } : null,
            error: input.coachError ? { message: input.coachError } : null,
          }
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => result,
      }
      return chain
    },
  }
}

async function main() {
const clientAccess = await authorizeConversationParticipant(
  fakeAdmin({ conversation }) as never,
  conversation.id,
  'client-user'
)
assert.equal(clientAccess.status, 'allowed')
if (clientAccess.status === 'allowed') assert.equal(clientAccess.participant.viewer, 'client')

const coachAccess = await authorizeConversationParticipant(
  fakeAdmin({ conversation, coachId: 'coach-row' }) as never,
  conversation.id,
  'coach-user'
)
assert.equal(coachAccess.status, 'allowed')
if (coachAccess.status === 'allowed') assert.equal(coachAccess.participant.viewer, 'coach')

assert.equal(
  (await authorizeConversationParticipant(
    fakeAdmin({ conversation, coachId: 'different-coach' }) as never,
    conversation.id,
    'other-user'
  )).status,
  'forbidden'
)
assert.equal(
  (await authorizeConversationParticipant(
    fakeAdmin({ conversation: null }) as never,
    'missing',
    'coach-user'
  )).status,
  'not_found'
)
assert.equal(
  (await authorizeConversationParticipant(
    fakeAdmin({ conversationError: 'temporary database failure' }) as never,
    conversation.id,
    'coach-user'
  )).status,
  'error'
)

const transientCoach = resolveDetectedRole({
  profile: { role: 'coach' },
  profileError: null,
  coach: null,
  coachError: 'temporary coaches lookup failure',
})
assert.equal(transientCoach.role, 'coach')

const sessionDecision = decideCoachSession({
  status: 'profile_unavailable',
  user: { id: 'coach-user' },
  role: 'coach',
  profileError: 'temporary coaches lookup failure',
})
assert.equal(sessionDecision.action, 'retry')

console.log('✓ transient coach lookup preserves coach role')
console.log('✓ participant, forbidden, missing, and server-error access are distinct')
console.log('✓ transient authenticated coach failures never trigger sign-out')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
