import assert from 'node:assert/strict'
import {
  buildCoachMemoryUpdatePrompt,
  clipCoachMemory,
  COACH_COMPACT_MAX_TURNS,
  readClientMood,
  selectTurnsToCompact,
  shouldAskBeforeAdvising,
} from '../src/lib/ai/coach-chat-memory'
import { coachReplyRequest } from '../src/lib/ai/coach-chat-persona'
import { chatTextForModel, encodeChatVoice } from '../src/lib/chat-reply-pause'
import { chatLanguageDirective, explicitChatLanguage } from '../src/lib/ai/coach-chat-language'
import { chatMoodDirective, parseChatMood } from '../src/lib/ai/coach-chat-mood'

assert.equal(shouldAskBeforeAdvising('my hand is paining'), true)
assert.equal(
  shouldAskBeforeAdvising('my right wrist hurts since yesterday when I benched'),
  false
)
assert.equal(shouldAskBeforeAdvising('what should I eat today'), false)
assert.equal(shouldAskBeforeAdvising('help'), true)
assert.equal(shouldAskBeforeAdvising('Hard workout chahiye'), false)
assert.equal(
  shouldAskBeforeAdvising(
    'Seated m mje maja nahi aara workout m Abi pain nhi h to normal workout kar do'
  ),
  false
)

const missingVoice = chatTextForModel(encodeChatVoice('user/ai-chat/1.webm', ''))
assert.match(missingVoice, /no transcript/i)
assert.equal(shouldAskBeforeAdvising(missingVoice), true)
assert.match(chatTextForModel(encodeChatVoice('user/ai-chat/1.webm', 'my knee hurts')), /my knee hurts/)

assert.equal(readClientMood(['this is useless, nothing is working!!']).mood, 'frustrated')
assert.equal(readClientMood(['my hand is paining']).mood, 'worried')
assert.equal(readClientMood(['yaar bhai kya karu']).mood, 'casual')
assert.equal(explicitChatLanguage('मेरा हाथ दर्द कर रहा है'), null)
assert.equal(explicitChatLanguage('please reply in hindi letters'), 'hindi_script')
assert.equal(explicitChatLanguage('sirf english'), 'english')
assert.match(chatLanguageDirective('hinglish'), /English letters only/)
assert.match(chatLanguageDirective('hindi_script'), /Devanagari/)
assert.equal(parseChatMood('calm'), 'calm')
assert.equal(parseChatMood('nope'), null)
assert.match(chatMoodDirective('short'), /one or two short lines/)
assert.match(chatMoodDirective('fired_up'), /More energy/)
assert.match(readClientMood(['yaar bhai kya karu']).note, /Do not switch into Hindi script/)
assert.doesNotMatch(readClientMood(['मेरा हाथ दर्द कर रहा है']).note, /Reply in Hindi/)

const ask = coachReplyRequest({
  clientText: 'my hand is paining',
  firstReply: false,
  mode: 'ai_thread',
})
assert.ok(ask.maxTokens < 300)
assert.match(ask.instruction, /one short question/i)
assert.doesNotMatch(ask.instruction, /Piyush|Rakshit/)

const human = coachReplyRequest({ clientText: 'what is for dinner', firstReply: true })
assert.match(human.instruction, /Coach Piyush/)
assert.doesNotMatch(human.instruction, /Rakshit/)

const memory = buildCoachMemoryUpdatePrompt({
  previous: 'Left wrist pain. Still unknown how it happened.',
  turns: 'Client: it twisted on Monday\nCoach: Got it. We will keep pressing light.',
})
assert.match(memory.userPrompt, /Left wrist pain/)
assert.match(memory.userPrompt, /it twisted on Monday/)
assert.match(memory.systemPrompt, /proceedings/)
assert.equal(selectTurnsToCompact(Array.from({ length: 11 }, (_, i) => i)).length, 0)
assert.equal(selectTurnsToCompact(Array.from({ length: 12 }, (_, i) => i)).length, 12)
assert.equal(
  selectTurnsToCompact(Array.from({ length: 50 }, (_, i) => i)).length,
  COACH_COMPACT_MAX_TURNS
)
assert.equal(clipCoachMemory('keep this'), 'keep this')
assert.ok(clipCoachMemory('x'.repeat(5000)).length <= 4001)

console.log('coach chat memory checks passed')
