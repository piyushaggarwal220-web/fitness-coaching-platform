import assert from 'node:assert/strict'
import { safeInternalPath, safeInternalPathOrNull } from '../src/lib/safe-navigation'
import { extractStorageObjectPath } from '../src/lib/storage/media-url'

assert.equal(safeInternalPath('/dashboard'), '/dashboard')
assert.equal(safeInternalPath('//evil.com'), '/dashboard')
assert.equal(safeInternalPath('https://evil.com'), '/dashboard')
assert.equal(safeInternalPath('/client/chat?x=1'), '/client/chat?x=1')
assert.equal(safeInternalPathOrNull('//evil.com'), null)
assert.equal(safeInternalPathOrNull('/plan'), '/plan')

assert.equal(
  extractStorageObjectPath(
    'https://zhcedsmvpvpaqezbdiiy.supabase.co/storage/v1/object/public/checkin-photos/user/a.jpg',
    'checkin-photos'
  ),
  'user/a.jpg'
)
assert.equal(extractStorageObjectPath('user/a.jpg', 'checkin-photos'), 'user/a.jpg')

console.log('Security helper verification passed')
