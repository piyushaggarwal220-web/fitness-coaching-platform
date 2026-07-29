import assert from 'node:assert/strict'
import { isChunkLoadError } from '../src/lib/chunk-load-recovery'

assert.equal(isChunkLoadError(new Error('Failed to load chunk /_next/static/chunks/38aj7h9codonc.js from module 30225')), true)
assert.equal(isChunkLoadError(Object.assign(new Error('boom'), { name: 'ChunkLoadError' })), true)
assert.equal(isChunkLoadError(new Error('Failed to save progress')), false)
assert.equal(isChunkLoadError(null), false)
console.log('✓ Chunk load error detection recognizes Next.js stale-deploy failures')
