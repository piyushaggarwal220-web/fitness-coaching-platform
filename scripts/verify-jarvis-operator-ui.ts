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
  OPERATOR_QUICK_CHIPS,
  coreHeadline,
  coreStateFromContext,
  humanToolLabel,
} from '../src/lib/jarvis/operator-present'
import { describeRealtimeCapability } from '../src/lib/jarvis/realtime/config'

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
}

console.log('=== Jarvis 2.0 operator UI ===')

assert.equal(liveMetaExecutionEnabled(), false, 'LIVE_META must stay false')
assert.equal(liveInstagramPublishingEnabled(), false, 'LIVE_IG must stay false')
console.log('  [PASS] live flags off')

const rt = describeRealtimeCapability()
assert.equal(rt.modalities.text, 'AVAILABLE', 'text modality available even when voice disabled')
console.log(`  [PASS] voice root cause: status=${rt.status}`)
console.log(`         ${rt.note}`)

const components = [
  'src/components/admin/jarvis/JarvisCore.tsx',
  'src/components/admin/jarvis/JarvisContextPanel.tsx',
  'src/components/admin/jarvis/JarvisConversation.tsx',
  'src/components/admin/jarvis/JarvisCommandPalette.tsx',
  'src/components/admin/jarvis/JarvisBusinessPulse.tsx',
  'src/components/admin/jarvis/JarvisAttention.tsx',
  'src/components/admin/jarvis/CockpitHome.tsx',
  'src/components/admin/jarvis/CommandCenter.tsx',
  'src/components/admin/jarvis/CommandBar.tsx',
  'docs/JARVIS-2-OPERATOR-INTERFACE.md',
]
for (const c of components) {
  mustExist(c)
  noSecrets(read(c), c)
}
console.log('  [PASS] operator UI components present')

const cockpit = read('src/components/admin/jarvis/CockpitHome.tsx')
assert.ok(cockpit.includes('JarvisCore'), 'home mounts JarvisCore')
assert.ok(cockpit.includes('JarvisContextPanel'), 'home mounts contextual panel')
assert.ok(cockpit.includes('OPERATOR_QUICK_CHIPS'), 'home uses chip actions')
assert.ok(cockpit.includes('coreSize') || cockpit.includes('300'), 'hero core size')
assert.ok(!/JARVIS OPERATOR/i.test(cockpit), 'no JARVIS OPERATOR eyebrow')
assert.ok(!/87% intelligent/i.test(cockpit), 'no fake progress copy')
console.log('  [PASS] operator home composition (hero core)')

const pulse = read('src/components/admin/jarvis/JarvisBusinessPulse.tsx')
assert.ok(pulse.includes('minmax(0'), 'pulse uses minmax(0) overflow-safe grid')
assert.ok(pulse.includes('textOverflow') || pulse.includes('ellipsis'), 'pulse ellipsis')
assert.ok(pulse.includes('preferData') || pulse.includes('Meta metrics'), 'pulse prefers data / collapses Meta')
console.log('  [PASS] business pulse overflow guards')

const center = read('src/components/admin/jarvis/CommandCenter.tsx')
assert.ok(center.includes('JarvisCommandPalette'), 'command palette wired')
assert.ok(center.includes('rail'), 'sidebar rail mode')
assert.ok(center.includes('compact'), 'compact admin chrome')
console.log('  [PASS] chrome minimized + palette')

const core = read('src/components/admin/jarvis/JarvisCore.tsx')
assert.ok(core.includes('jarvis-breathe'), 'core idle animation')
assert.ok(core.includes('jarvis-listen'), 'core listen animation')
assert.ok(core.includes('prefers-reduced-motion'), 'reduced motion')
console.log('  [PASS] core motion states')

assert.ok(PALETTE_COMMANDS.length >= 8)
assert.ok(OPERATOR_QUICK_CHIPS.length >= 4)
assert.equal(humanToolLabel('video.create_edl'), 'Creating video edit')
assert.equal(coreHeadline('IDLE', 'Good afternoon.'), 'Good afternoon')
assert.equal(coreHeadline('WAITING_FOR_APPROVAL'), 'Waiting for your approval.')
assert.equal(coreStateFromContext({}).state, 'IDLE')
assert.equal(coreStateFromContext({ pendingApprovals: 1 }).state, 'WAITING_FOR_APPROVAL')
console.log('  [PASS] activity language + headlines')

const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
assert.ok(packageJson.scripts['verify:jarvis-operator-ui'])
console.log('  [PASS] verify script registered')

console.log('\nJarvis 2.0 visual overhaul verification passed (offline).')
console.log('Manual Visual QA still required on /admin/jarvis at 1280/1440/1920.')
