/**
 * Phase 22 hardening verification only.
 */
import assert from 'node:assert/strict'
import { runHardeningAudit } from '../src/lib/jarvis/hardening'
import { liveMetaExecutionEnabled } from '../src/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram'

const audit = runHardeningAudit()
for (const f of audit.findings) {
  console.log(`[${f.status}] ${f.area}/${f.id}: ${f.detail}`)
}
assert.equal(audit.ok, true)
assert.equal(liveMetaExecutionEnabled(), false)
assert.equal(liveInstagramPublishingEnabled(), false)
console.log('\nPhase 22 hardening verification passed.')
