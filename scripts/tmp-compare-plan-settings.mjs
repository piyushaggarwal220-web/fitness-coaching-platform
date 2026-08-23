import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

async function get(theme, key) {
  const r = await fetch(
    `${API}/themes/${theme}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const j = await r.json()
  return j.asset?.value
}

function findPlan(index) {
  for (const s of Object.values(index.sections || {})) {
    for (const b of Object.values(s.blocks || {})) {
      if (b.type === 'ai_gen_block_361650c') return b.settings
    }
  }
}

const live = JSON.parse(await get('161294057723', 'templates/index.json'))
const draft = JSON.parse(await get('161375289595', 'templates/index.json'))
const lp = findPlan(live)
const dp = findPlan(draft)
const keys = [
  'plan_1_enabled',
  'plan_1_price',
  'plan_2_price',
  'plan_2_original_price',
  'plan_2_link',
  'plan_2_savings',
  'plan_3_price',
  'plan_3_original_price',
  'plan_3_link',
  'plan_4_price',
  'plan_4_original_price',
  'plan_4_link',
  'subheadline',
  'urgency_label',
  'urgency_subtext',
]
const out = { live: {}, draft: {} }
for (const k of keys) {
  out.live[k] = lp?.[k]
  out.draft[k] = dp?.[k]
}
console.log(JSON.stringify(out, null, 2))
console.log(
  'live sections',
  Object.keys(live.sections || {}).filter((k) => /cart|trial|hide|social|login|floating/i.test(k))
)
console.log(
  'draft sections',
  Object.keys(draft.sections || {}).filter((k) => /cart|trial|hide|social|login|floating/i.test(k))
)
console.log('draft order cart/trial', (draft.order || []).filter((x) => /cart|trial/i.test(x)))
