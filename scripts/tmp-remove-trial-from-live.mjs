import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const THEME_ID = '161294057723'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
}

async function get(key) {
  const r = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  if (!r.ok || !j.asset?.value) throw new Error(`GET ${key}: ${JSON.stringify(j).slice(0, 300)}`)
  return j.asset.value
}

async function put(key, value) {
  const r = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`PUT ${key}: ${JSON.stringify(j).slice(0, 400)}`)
  console.log('updated', key)
}

const index = JSON.parse(await get('templates/index.json'))
const changes = []

// 1) Disable plan_1 (7-day trial) in the plan selector block
let planBlock = null
for (const sec of Object.values(index.sections || {})) {
  for (const blk of Object.values(sec.blocks || {})) {
    if (blk.type === 'ai_gen_block_361650c' && blk.settings) {
      planBlock = blk
      break
    }
  }
}
if (!planBlock) throw new Error('Plan selector block not found')

if (planBlock.settings.plan_1_enabled !== false) {
  planBlock.settings.plan_1_enabled = false
  changes.push('plan_1_enabled=false')
}
if (/7 days|trial/i.test(planBlock.settings.subheadline || '')) {
  planBlock.settings.subheadline =
    'Pick 3 / 6 / 12 months. Same full coaching on every plan. Use WELCOME60 for 60% off.'
  changes.push('subheadline updated')
}

// 2) Remove dedicated trial card section from homepage
if (index.sections?.lurvox_trial_card) {
  delete index.sections.lurvox_trial_card
  changes.push('removed lurvox_trial_card section')
}
if (Array.isArray(index.order)) {
  const before = index.order.length
  index.order = index.order.filter((id) => id !== 'lurvox_trial_card')
  if (index.order.length !== before) changes.push('removed lurvox_trial_card from order')
}

// 3) Update custom-liquid hide helper so any leftover plan_1/179 card stays hidden
for (const sec of Object.values(index.sections || {})) {
  for (const [bid, blk] of Object.entries(sec.blocks || {})) {
    const cl = blk?.settings?.custom_liquid
    if (typeof cl === 'string' && /lurvox-hide-1month|data-plan-index/.test(cl)) {
      blk.settings.custom_liquid = `<!-- lurvox-hide-trial-and-1month-v1 -->
<style id="lurvox-hide-1month-style">
  /* Hide retired 1-month + 7-day trial from plan selector */
  [data-plan-index="1"],
  [data-plan-price="179"],
  [data-plan-price="999"],
  [data-plan-price="499"],
  [data-plan-link*="trial"],
  [data-plan-link*="1_week_trial"] {
    display: none !important;
  }
</style>
`
      changes.push(`updated hide liquid in ${bid}`)
    }
  }
}

if (!changes.length) {
  console.log('No changes needed')
  process.exit(0)
}

await put('templates/index.json', JSON.stringify(index, null, 2))

// Verify
const verify = JSON.parse(await get('templates/index.json'))
let verifiedPlan = null
for (const sec of Object.values(verify.sections || {})) {
  for (const blk of Object.values(sec.blocks || {})) {
    if (blk.type === 'ai_gen_block_361650c') verifiedPlan = blk.settings
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      themeId: THEME_ID,
      changes,
      plan_1_enabled: verifiedPlan?.plan_1_enabled,
      subheadline: verifiedPlan?.subheadline,
      hasTrialSection: Boolean(verify.sections?.lurvox_trial_card),
      order: verify.order,
    },
    null,
    2
  )
)
