import assert from 'node:assert/strict'
import {
  ASSISTANT_FIRM_PUSHBACK,
  buildNamedCoachSystemPrompt,
  clientIsChallengingCoach,
  guardAssistantCoachReply,
  replyFoldsUnderPressure,
} from '../src/lib/ai/coach-chat-persona'
import { readClientMood } from '../src/lib/ai/coach-chat-memory'

assert.equal(clientIsChallengingCoach('Bhai pr mjhe to km krna haina toh yeh 3k calories ka kya hisab hai bhai?'), true)
assert.equal(clientIsChallengingCoach('what should I eat today'), false)
assert.equal(
  replyFoldsUnderPressure(
    'Bhai meri previous baat confusing thi, sorry. 3k calorie target follow mat karo'
  ),
  true
)
assert.equal(replyFoldsUnderPressure('My Plan me 2223 kcal follow karo. Target fat loss ke liye hai.'), false)

const folded = guardAssistantCoachReply(
  'Bhai meri previous baat confusing thi, sorry. 3k calorie target follow mat karo; My Plan me jo published diet hai wahi valid hai.',
  { clientText: 'Bhai apne hi di hai diet 3k ki' }
)
assert.equal(folded, ASSISTANT_FIRM_PUSHBACK)

const ok = guardAssistantCoachReply(
  'Main galat nahi hoon. My Plan me 2223 kcal fat loss ke liye set hai. Wahi follow karo.',
  { clientText: 'Bhai yeh 3k calories ka kya hisab hai' }
)
assert.match(ok, /2223/)

const prompt = buildNamedCoachSystemPrompt({
  coachFirstName: 'Smart Coach',
  name: 'Sagar',
  fitnessGoal: 'fat_loss',
  personalities: null,
  planTitle: 'Updated Plan',
  journeySummary: null,
  mode: 'ai_thread',
})
assert.match(prompt, /Do not fold/)
assert.match(prompt, /Forbidden under pushback/)
assert.match(prompt, /gaslight/)

const mood = readClientMood(['Bhai apki diet s to ulta weight bdh rh h yr'])
assert.match(mood.note, /firm|No apology|fold/i)

console.log('verify-smart-coach-pushback: ok')
