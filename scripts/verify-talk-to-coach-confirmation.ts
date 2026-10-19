import assert from 'node:assert/strict'
import {
  buildClientCallConfirmation,
  callDayFromMessage,
  isClientEmail,
} from '../src/lib/talk-to-coach-confirmation'

assert.equal(isClientEmail('person@example.com'), true)
assert.equal(isClientEmail('not-an-email'), false)
assert.equal(isClientEmail(''), false)

const message = [
  'Name: Asha',
  'Email: asha@example.com',
  'Call day: Tuesday, 20 October',
  'Agreed: I agree and book my call.',
].join('\n')

assert.equal(callDayFromMessage(message), 'Tuesday, 20 October')
assert.equal(callDayFromMessage('No day here'), null)

const mail = buildClientCallConfirmation({
  name: 'Asha',
  preferredTime: '5–6 pm IST',
  message,
})

assert.equal(mail.subject, 'Your LURVOX call is booked')
assert.match(mail.text, /Hi Asha/)
assert.match(mail.text, /Your call is booked/)
assert.match(mail.text, /Tuesday, 20 October, 5–6 pm IST/)
assert.match(mail.text, /answer the phone when the coach calls/)
assert.match(mail.html, /Tuesday, 20 October, 5–6 pm IST/)

const timeOnly = buildClientCallConfirmation({
  name: 'Asha',
  preferredTime: '7–8 pm IST',
  message: 'Goal: Fat loss',
})
assert.match(timeOnly.text, /A coach will call you on 7–8 pm IST/)

console.log('talk-to-coach confirmation email ok')
