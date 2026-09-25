/**
 * Jarvis dense operator UI verification (offline / structural).
 * Asserts restoration of the pre-orb Command Center layout.
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

console.log('=== Jarvis dense operator UI ===')

assert.equal(liveMetaExecutionEnabled(), false, 'LIVE_META must stay false')
assert.equal(liveInstagramPublishingEnabled(), false, 'LIVE_IG must stay false')
console.log('  [PASS] live flags off')

const rt = describeRealtimeCapability()
assert.equal(rt.modalities.text, 'AVAILABLE', 'text modality available even when voice disabled')
console.log(`  [PASS] voice root cause: status=${rt.status}`)
console.log(`         ${rt.note}`)

const components = [
  'src/components/admin/jarvis/CockpitHome.tsx',
  'src/components/admin/jarvis/CommandCenter.tsx',
  'src/components/admin/jarvis/CommandBar.tsx',
  'src/components/admin/jarvis/RightRail.tsx',
  'src/components/admin/jarvis/Sidebar.tsx',
  'src/components/admin/jarvis/TopBar.tsx',
  'src/components/admin/jarvis/JarvisCommandPalette.tsx',
  'docs/JARVIS-2-OPERATOR-INTERFACE.md',
]
for (const c of components) {
  mustExist(c)
  noSecrets(read(c), c)
}
console.log('  [PASS] operator UI components present')

const cockpit = read('src/components/admin/jarvis/CockpitHome.tsx')
assert.ok(!cockpit.includes('JarvisCore'), 'home must not mount giant JarvisCore orb')
assert.ok(!cockpit.includes('coreSize'), 'home must not size a hero orb')
assert.ok(cockpit.includes('cockpit.metrics'), 'dense metrics strip restored')
assert.ok(cockpit.includes('Video operations'), 'video workflow section present')
assert.ok(cockpit.includes('Attach footage') || cockpit.includes('useFootageUpload'), 'footage attach control')
assert.ok(cockpit.includes('onAttach') || cockpit.includes('openPicker'), 'footage attach wired to command bar')
assert.ok(cockpit.includes('composerDock') || cockpit.includes('CommandBar'), 'command input dock')
assert.ok(cockpit.includes('core.state'), 'compact state indicator (not orb)')
assert.ok(cockpit.includes('Read this'), 'opening briefing can be read aloud')
assert.ok(cockpit.includes('Needs your OK'), 'one approval sits on the home')
assert.ok(!/Waiting for your approval\./.test(cockpit), 'no orb headline dominating home')
console.log('  [PASS] dense operator home (no giant orb)')

const commandBar = read('src/components/admin/jarvis/CommandBar.tsx')
assert.ok(commandBar.includes('Attach footage'), 'command bar shows Attach footage label')
assert.ok(commandBar.includes('onAttach'), 'command bar attach handler')
console.log('  [PASS] attach footage visible in command bar')

const chat = read('src/components/admin/jarvis/ChatPane.tsx')
assert.ok(chat.includes('useFootageUpload') || chat.includes('onAttach'), 'chat pane wires footage ingest')
console.log('  [PASS] chat pane footage ingest wired')

const ingest = read('src/components/admin/jarvis/use-footage-upload.tsx')
assert.ok(ingest.includes('/api/admin/jarvis/video-sources'), 'ingest uses existing video-sources API')
assert.ok(ingest.includes('create_session'), 'ingest creates video session')
assert.ok(ingest.includes('FormData'), 'ingest posts multipart file')
console.log('  [PASS] footage ingest uses existing video-sources pipeline')

const center = read('src/components/admin/jarvis/CommandCenter.tsx')
assert.ok(center.includes('RightRail'), 'desktop right rail wired')
assert.ok(center.includes('JarvisSidebar'), 'sidebar navigation')
const sidebar = read('src/components/admin/jarvis/Sidebar.tsx')
assert.ok(sidebar.includes('Later'), 'quiet nav group for unfinished rooms')
assert.ok(sidebar.includes("id: 'customers'"), 'customers route still reachable')
assert.ok(center.includes('JarvisCommandPalette'), 'command palette wired')
assert.ok(!center.includes('rail />') && !center.includes('rail={true}'), 'icon-only rail mode retired')
console.log('  [PASS] dense chrome: sidebar + main + right rail')

const approvals = read('src/components/admin/jarvis/ApprovalsView.tsx')
assert.ok(approvals.includes('ACTION'), 'approval ACTION label')
assert.ok(approvals.includes('WHY'), 'approval WHY label')
assert.ok(/RISK/.test(approvals), 'approval RISK label')
assert.ok(/TARGET/.test(approvals), 'approval TARGET label')
assert.ok(approvals.includes('Approve') && approvals.includes('Reject'), 'approve/reject actions')
console.log('  [PASS] compact approval card labels')

assert.ok(PALETTE_COMMANDS.length >= 8)
assert.ok(OPERATOR_QUICK_CHIPS.length >= 4)
assert.equal(humanToolLabel('video.create_edl'), 'Creating video edit')
assert.equal(coreHeadline('IDLE', 'Good afternoon.'), 'Good afternoon')
assert.equal(coreHeadline('WAITING_FOR_APPROVAL'), 'Waiting for your approval.')
assert.equal(coreStateFromContext({}).state, 'IDLE')
assert.equal(coreStateFromContext({ pendingApprovals: 1 }).state, 'WAITING_FOR_APPROVAL')
console.log('  [PASS] activity language helpers retained')

const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
assert.ok(packageJson.scripts['verify:jarvis-operator-ui'])
console.log('  [PASS] verify script registered')

console.log('\nJarvis dense operator UI verification passed (offline).')
console.log('Manual Visual QA: /admin/jarvis — no giant orb; dense metrics + right rail + command dock.')
