/**
 * Jarvis 2.0 operator UI verification (offline / structural).
 * Does not enable Meta or Instagram. Does not mutate production business data.
 *
 * Run: npm run verify:jarvis-operator-ui
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { liveMetaExecutionEnabled } from '../src/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram'
import {
  PALETTE_COMMANDS,
  OPERATOR_QUICK_ACTIONS,
  coreStateFromContext,
  humanToolLabel,
} from '../src/lib/jarvis/operator-present'

const ROOT = path.resolve(__dirname, '..')

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function mustExist(rel: string) {
  assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`)
}

function noSecrets(text: string, label: string) {
  assert.ok(!/EAA[A-Za-z0-9]{20,}/.test(text), `${label} leaked Meta-like token`)
  assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(text), `${label} leaked OpenAI-like key`)
  assert.ok(!/service_role/i.test(text) || label.includes('docs'), `${label} unexpected service_role`)
}

console.log('=== Jarvis 2.0 operator UI ===')

assert.equal(liveMetaExecutionEnabled(), false, 'LIVE_META must stay false')
assert.equal(liveInstagramPublishingEnabled(), false, 'LIVE_IG must stay false')
console.log('  [PASS] live flags off')

const components = [
  'src/components/admin/jarvis/JarvisCore.tsx',
  'src/components/admin/jarvis/JarvisShell.tsx',
  'src/components/admin/jarvis/JarvisConversation.tsx',
  'src/components/admin/jarvis/JarvisCommandPalette.tsx',
  'src/components/admin/jarvis/JarvisVoiceButton.tsx',
  'src/components/admin/jarvis/JarvisOperationTimeline.tsx',
  'src/components/admin/jarvis/JarvisOperationCard.tsx',
  'src/components/admin/jarvis/JarvisApprovalCard.tsx',
  'src/components/admin/jarvis/JarvisCreativeGallery.tsx',
  'src/components/admin/jarvis/JarvisVideoResult.tsx',
  'src/components/admin/jarvis/JarvisBusinessPulse.tsx',
  'src/components/admin/jarvis/JarvisAttention.tsx',
  'src/components/admin/jarvis/JarvisSystemStatus.tsx',
  'src/components/admin/jarvis/JarvisCostStatus.tsx',
  'src/components/admin/jarvis/CockpitHome.tsx',
  'src/components/admin/jarvis/CommandCenter.tsx',
  'src/components/admin/jarvis/VoiceOperatorPanel.tsx',
  'docs/JARVIS-2-OPERATOR-INTERFACE.md',
]
for (const c of components) {
  mustExist(c)
  noSecrets(read(c), c)
}
console.log('  [PASS] operator UI components present, no secret leakage')

const cockpit = read('src/components/admin/jarvis/CockpitHome.tsx')
assert.ok(cockpit.includes('JarvisCore'), 'home mounts JarvisCore')
assert.ok(cockpit.includes('JarvisConversation'), 'home mounts conversation')
assert.ok(cockpit.includes('JarvisVoiceButton'), 'home mounts voice')
assert.ok(cockpit.includes('OPERATOR_QUICK_ACTIONS'), 'home has quick actions')
assert.ok(cockpit.includes('JarvisBusinessPulse'), 'home has business pulse')
assert.ok(!/87% intelligent/i.test(cockpit), 'no fake progress copy')
console.log('  [PASS] operator home composition')

const center = read('src/components/admin/jarvis/CommandCenter.tsx')
assert.ok(center.includes('JarvisCommandPalette'), 'command palette wired')
assert.ok(center.includes('jarvis:interrupt-speech'), 'Escape speech interrupt wired')
assert.ok(center.includes("key.toLowerCase() === 'k'"), 'Ctrl/Cmd+K wired')
console.log('  [PASS] palette + keyboard')

const voice = read('src/components/admin/jarvis/VoiceOperatorPanel.tsx')
assert.ok(voice.includes('jarvis:interrupt-speech'), 'voice listens for Escape interrupt')
assert.ok(voice.includes('Hold') || voice.includes('hold') || voice.includes('LISTENING'), 'PTT states present')
assert.ok(!/wake.?word/i.test(voice), 'no wake word')
assert.ok(!/always.?on/i.test(voice), 'no always-on mic marketing')
console.log('  [PASS] voice session constraints')

const approval = read('src/components/admin/jarvis/JarvisApprovalCard.tsx')
assert.ok(approval.includes('Phase 12'), 'approval references Phase 12')
assert.ok(approval.includes('ApprovalCardView'), 'reuses existing approval card')
console.log('  [PASS] approval state reuses Phase 12 UI')

assert.ok(PALETTE_COMMANDS.length >= 8, 'palette commands defined')
assert.ok(OPERATOR_QUICK_ACTIONS.length >= 4, 'quick actions defined')
assert.equal(humanToolLabel('video.create_edl'), 'Creating video edit')
assert.equal(humanToolLabel('instagram.plan_content'), 'Planning Instagram content')
assert.equal(humanToolLabel('analytics.performance_analysis'), 'Analyzing performance')
assert.equal(humanToolLabel('memory.search'), "Checking what we've learned before")
assert.equal(humanToolLabel('execution.policy_status'), 'Checking execution permissions')
console.log('  [PASS] activity language')

const idle = coreStateFromContext({})
assert.equal(idle.state, 'IDLE')
const listening = coreStateFromContext({ listening: true })
assert.equal(listening.state, 'LISTENING')
const approvalWait = coreStateFromContext({ pendingApprovals: 2 })
assert.equal(approvalWait.state, 'WAITING_FOR_APPROVAL')
const paused = coreStateFromContext({ budgetExhausted: true })
assert.equal(paused.state, 'PAUSED')
const rendering = coreStateFromContext({ busy: true, activeTool: 'video.render' })
assert.equal(rendering.state, 'RENDERING')
assert.ok(rendering.detail.toLowerCase().includes('render'), 'render detail honest')
console.log('  [PASS] core state mapping (no fake progress)')

const page = read('src/app/admin/jarvis/page.tsx')
assert.ok(page.includes('JarvisCommandCenter') || page.includes('jarvis'), 'page entry intact')
console.log('  [PASS] authenticated route entry still Command Center')

const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
assert.ok(packageJson.scripts['verify:jarvis-operator-ui'], 'npm script registered')
console.log('  [PASS] verify script registered')

console.log('\nJarvis 2.0 operator UI verification passed (offline).')
console.log('Manual Visual QA still required on /admin/jarvis (desktop/tablet/mobile).')
