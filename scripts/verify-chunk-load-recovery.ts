import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CHUNK_LOAD_USER_MESSAGE,
  isChunkLoadError,
} from '../src/lib/chunk-load-recovery'

assert.equal(
  isChunkLoadError(
    new Error('Failed to load chunk /_next/static/chunks/0foyx1b4nfma3.js from module 30225')
  ),
  true
)
assert.equal(
  isChunkLoadError(Object.assign(new Error('boom'), { name: 'ChunkLoadError' })),
  true
)
assert.equal(isChunkLoadError(new Error('Failed to save progress')), false)
assert.equal(isChunkLoadError(null), false)
assert.match(CHUNK_LOAD_USER_MESSAGE, /refresh/i)

const root = process.cwd()
const layout = readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8')
assert.match(layout, /ChunkLoadRecovery/, 'root layout mounts chunk-load recovery')

const onboarding = readFileSync(path.join(root, 'src/app/onboarding/page.tsx'), 'utf8')
assert.match(onboarding, /isChunkLoadError/, 'onboarding handles chunk-load errors')
assert.match(onboarding, /reloadForNewDeployment/, 'onboarding reloads after stale chunks')

const uploadHelper = readFileSync(path.join(root, 'src/lib/onboarding.ts'), 'utf8')
assert.match(uploadHelper, /importWithChunkRetry/, 'photo upload retries stale dynamic imports')

const sw = readFileSync(path.join(root, 'public/notification-sw.js'), 'utf8')
assert.match(sw, /bypass|_next\/static/, 'service worker mentions Next static assets')
assert.match(
  sw,
  /Do not cache\/intercept hashed Next\.js build assets|pathname\.startsWith\('\/_next\//,
  'service worker bypasses hashed Next build assets'
)

console.log('✓ Chunk load error detection recognizes Next.js stale-deploy failures')
