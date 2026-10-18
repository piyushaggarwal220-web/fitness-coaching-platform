import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chronologicalChatWindow } from '../src/lib/ai/ai-coach-history'
import { aiCoachImageStoragePath } from '../src/lib/ai/ai-coach-photo-path'

const newestFirst = [
  { id: '5' },
  { id: '4' },
  { id: '3' },
  { id: '2' },
  { id: '1' },
]
assert.deepEqual(
  chronologicalChatWindow(newestFirst, 3).map((row) => row.id),
  ['3', '4', '5']
)
assert.deepEqual(
  chronologicalChatWindow(newestFirst, 80).map((row) => row.id),
  ['1', '2', '3', '4', '5']
)

assert.equal(aiCoachImageStoragePath('user-1', 'My Photo (1).JPG', 42), 'user-1/ai-chat/42.jpg')
assert.equal(aiCoachImageStoragePath('user-1', 'shot.png', 7), 'user-1/ai-chat/7.png')
assert.equal(aiCoachImageStoragePath('user-1', 'weird].webp', 1), 'user-1/ai-chat/1.webp')
assert.throws(() => aiCoachImageStoragePath('user/other', 'a.jpg', 1))

const route = readFileSync('src/app/api/client/ai-chat/route.ts', 'utf8')
assert.match(route, /order\('created_at', \{ ascending: false \}\)/)
assert.match(route, /chronologicalChatWindow/)
assert.doesNotMatch(route, /order\('created_at', \{ ascending: true \}\)\s*\.limit\(80\)/)

const policy = readFileSync(
  'supabase/migrations/20261018194500_ai_coach_chat_image_uploads.sql',
  'utf8'
)
assert.match(policy, /ai-chat/)
assert.match(policy, /auth\.uid\(\)::text = \(storage\.foldername\(objects\.name\)\)\[1\]/)
assert.match(policy, /coach_conversations/)

const thread = readFileSync('src/components/chat/AiCoachChatThread.tsx', 'utf8')
assert.match(thread, /aiCoachImageStoragePath/)
assert.doesNotMatch(thread, /ai-chat\/\$\{Date\.now\(\)\}_/)

console.log('ai coach chat history checks passed')
