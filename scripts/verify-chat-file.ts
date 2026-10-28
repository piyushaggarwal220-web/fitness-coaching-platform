import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  chatFileTextForModel,
  decodeChatFile,
  encodeChatFile,
  isImageFile,
  isVideoFile,
} from '../src/lib/chat-file'
import { extractChatFileText } from '../src/lib/ai/read-chat-file'

assert.equal(isVideoFile('clip.mp4', 'video/mp4'), true)
assert.equal(isVideoFile('notes.pdf', 'application/pdf'), false)
assert.equal(isImageFile('meal.jpg', 'image/jpeg'), true)
assert.equal(isVideoFile('report.mov'), true)

const encoded = encodeChatFile('user/ai-chat/1.pdf', 'labs.pdf', 'Look at page 2', 'Glucose 99')
const decoded = decodeChatFile(encoded)
assert.equal(decoded.path, 'user/ai-chat/1.pdf')
assert.equal(decoded.name, 'labs.pdf')
assert.equal(decoded.text, 'Look at page 2')
assert.match(decoded.extract, /Glucose 99/)
assert.match(chatFileTextForModel(encoded) ?? '', /Glucose 99/)
assert.doesNotMatch(decoded.text, /Glucose/)

async function main() {
const sheet = XLSX.utils.aoa_to_sheet([
  ['Food', 'Grams'],
  ['Rice', 80],
])
const book = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(book, sheet, 'Meals')
const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
const text = await extractChatFileText('meals.xlsx', bytes)
assert.match(text, /Rice/)
assert.match(text, /80/)

const plain = await extractChatFileText('note.txt', Buffer.from('Paneer 100g\n'))
assert.match(plain, /Paneer 100g/)

const video = await extractChatFileText('clip.mp4', Buffer.from('not a video'))
assert.match(video, /video/i)

console.log('chat file checks passed')
}

main()
