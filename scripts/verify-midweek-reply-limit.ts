import assert from 'node:assert/strict'
import {
  MIDWEEK_CLIENT_REPLY_MAX_WORDS,
  countCoachReplyWords,
  limitCoachReplyWords,
  stripHyphensForCoachReply,
} from '../src/lib/ai/midweek-analysis'

assert.equal(MIDWEEK_CLIENT_REPLY_MAX_WORDS, 40)

const short = 'Hey Raj, solid week so far. Keep protein high tonight and hit tomorrow morning session.'
assert.ok(countCoachReplyWords(short) <= 40)
assert.equal(limitCoachReplyWords(short), stripHyphensForCoachReply(short))

const long = Array.from({ length: 80 }, (_, i) => `word${i + 1}`).join(' ')
const limited = limitCoachReplyWords(long)
assert.ok(
  countCoachReplyWords(limited) <= MIDWEEK_CLIENT_REPLY_MAX_WORDS,
  `expected <= ${MIDWEEK_CLIENT_REPLY_MAX_WORDS} words, got ${countCoachReplyWords(limited)}`
)

const sentences =
  'Hey Sam, great job staying consistent on workouts this week so far. Sleep dipped a bit so protect bedtime tonight. Keep water high and finish the week strong with one clean grocery run.'
const sentenceLimited = limitCoachReplyWords(sentences)
assert.ok(countCoachReplyWords(sentenceLimited) <= MIDWEEK_CLIENT_REPLY_MAX_WORDS)
assert.match(sentenceLimited, /[.!?]$/)

console.log('✓ mid-week client reply hard-capped at 40 words')
