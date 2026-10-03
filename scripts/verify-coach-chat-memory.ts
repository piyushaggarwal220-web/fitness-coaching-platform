import assert from 'node:assert/strict'
import {
  buildCoachMemoryUpdatePrompt,
  clipCoachMemory,
  readClientMood,
  shouldAskBeforeAdvising,
} from '../src/lib/ai/coach-chat-memory'
import { coachReplyRequest } from '../src/lib/ai/coach-chat-persona'
import { chatTextForModel, encodeChatVoice } from '../src/lib/chat-reply-pause'
import { chatLanguageDirective, explicitChatLanguage } from '../src/lib/ai/coach-chat-language'

assert.equal(shouldAskBeforeAdvising('my hand is paining'), true)
assert.equal(
  shouldAskBeforeAdvising('my right wrist hurts since yesterday when I benched'),
  false
)
assert.equal(shouldAskBeforeAdvising('what should I eat today'), false)
assert.equal(shouldAskBeforeAdvising('help'), true)

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
assert.match(readClientMood(['yaar bhai kya karu']).note, /Do not switch into Hindi script/)
assert.doesNotMatch(readClientMood(['मेरा हाथ दर्द कर रहा है']).note, /Reply in Hindi/)

const ask = coachReplyRequest({
  clientText: 'my hand is paining',
  firstReply: false,
  mode: 'ai_thread',
})
assert.ok(ask.maxTokens < 300)
assert.match(ask.instruction, /questions/i)
assert.doesNotMatch(ask.instruction, /Piyush|Rakshit/)

const human = coachReplyRequest({ clientText: 'what is for dinner', firstReply: true })
assert.match(human.instruction, /Coach Piyush and Coach Rakshit/)

const memory = buildCoachMemoryUpdatePrompt({
  previous: 'Left wrist pain. Still unknown how it happened.',
  turns: 'Client: it twisted on Monday\nCoach: Got it. We will keep pressing light.',
})
assert.match(memory.userPrompt, /Left wrist pain/)
assert.match(memory.systemPrompt, /Do not append a diary/)
assert.ok(clipCoachMemory('x'.repeat(1200)).length <= 901)

console.log('coach chat memory checks passed')
