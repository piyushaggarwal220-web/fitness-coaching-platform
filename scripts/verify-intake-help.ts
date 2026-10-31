import assert from 'node:assert/strict'
import { intakeHelpTranscript, replyToIntakeHelp } from '../src/lib/onboarding/intake-help'

const stuck = replyToIntakeHelp({
  message: "I can't continue",
  section: 'Eating',
  step: 17,
  blockedReason: 'Pick at least 3 foods you actually eat. Search if your city is not listed.',
})
assert.match(stuck.text, /at least 3 foods/)
assert.equal(stuck.offerSend, true)

const city = replyToIntakeHelp({
  message: 'My city or food is missing',
  section: 'Eating',
  step: 17,
})
assert.match(city.text, /Add a food that is not on this list/)
assert.equal(city.offerSend, false)

const photo = replyToIntakeHelp({ message: 'Photo won’t upload', section: 'Photos', step: 21 })
assert.match(photo.text, /Front, side, and back/)
assert.equal(photo.offerSend, true)

const team = replyToIntakeHelp({ message: 'Send this to the team', section: 'Diet', step: 13 })
assert.equal(team.offerSend, true)
assert.match(team.text, /support request/)

const dietAdvice = replyToIntakeHelp({ message: 'What should I eat for fat loss?', section: 'Diet', step: 13 })
assert.match(dietAdvice.text, /does not change your diet|coaching plan|finish/i)
assert.doesNotMatch(dietAdvice.text, /calorie/)

const transcript = intakeHelpTranscript([
  { from: 'you', text: 'Photo won’t upload' },
  { from: 'help', text: 'Wait until Uploaded.' },
])
assert.match(transcript, /Client: Photo/)
assert.match(transcript, /Help: Wait/)

console.log('Intake help checks passed.')
