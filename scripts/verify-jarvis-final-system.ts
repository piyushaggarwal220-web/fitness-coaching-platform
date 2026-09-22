/**
 * Phase 22 + final system verification orchestrator.
 * Runs hardening audits, then key phase verify scripts as child processes.
 * No external writes.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { runHardeningAudit } from '../src/lib/jarvis/hardening'
import { liveMetaExecutionEnabled } from '../src/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram'
import matrix from '../src/lib/jarvis/hardening/capability-matrix.json'

function ok(l: string) {
  console.log(`✓ ${l}`)
}

function runNpm(script: string) {
  const r = spawnSync('npm', ['run', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
  })
  if (r.status !== 0) {
    console.error(r.stdout)
    console.error(r.stderr)
    throw new Error(`Script failed: ${script} (exit ${r.status})`)
  }
  console.log(`✓ regression: ${script}`)
}

console.log('=== Phase 22 hardening audit ===')
{
  const audit = runHardeningAudit()
  for (const f of audit.findings) {
    console.log(`  [${f.status}] ${f.id}: ${f.detail}`)
  }
  assert.equal(audit.ok, true, JSON.stringify(audit.failed, null, 2))
  ok('Hardening audit PASS')
}

{
  assert.equal(matrix.live_meta, false)
  assert.equal(matrix.live_instagram, false)
  assert.equal(matrix.capabilities.meta_writes_live, 'BLOCKED')
  assert.equal(matrix.capabilities.instagram_publishing, 'BLOCKED')
  assert.equal(liveMetaExecutionEnabled(), false)
  assert.equal(liveInstagramPublishingEnabled(), false)
  ok('Capability matrix + live flags safe')
}

console.log('\n=== Phase verify scripts ===')
const scripts = [
  'verify:jarvis-core',
  'verify:jarvis-learning',
  'verify:jarvis-taste',
  'verify:jarvis-controlled-execution',
  'verify:jarvis-event-driven-brain',
  'verify:jarvis-strategic-memory',
  'verify:jarvis-phases-15-20',
  'verify:jarvis-long-horizon',
]

for (const s of scripts) {
  runNpm(s)
}

console.log('\nJarvis final system verification passed (offline).')
console.log('Run separately for full suite: verify:jarvis, operator, video, creative, editor, IG, content-ops, autonomous, realtime')
console.log('Also: npx tsc --noEmit')
