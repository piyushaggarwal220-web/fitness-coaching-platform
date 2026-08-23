/**
 * Final polish: hide spammy countdown on mobile, title-case durations.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (!res.ok) throw new Error(`GET ${key} ${res.status}`)
  return (await res.json()).asset.value
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`PUT ${key} ${res.status} ${(await res.text()).slice(0, 300)}`)
}

const themes = await (await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })).json()
const live = themes.themes.find((t) => t.role === 'main')

let block = await getAsset(live.id, 'blocks/ai_gen_block_361650c.liquid')
const extra = `
  .ai-transformation-plan-urgency-{{ ai_gen_id }} {
    display: none !important;
  }

  @media screen and (min-width: 750px) {
    .ai-transformation-plan-urgency-{{ ai_gen_id }} {
      display: block !important;
      margin-top: 8px !important;
      margin-bottom: 12px !important;
      opacity: 0.85;
    }
    .ai-transformation-plan-countdown-{{ ai_gen_id }} {
      font-size: 1.75rem !important;
      letter-spacing: 0.04em !important;
    }
  }
`
if (!block.includes('ai-transformation-plan-urgency-{{ ai_gen_id }} {\n    display: none')) {
  block = block.replace(
    '/* /lurvox-plan-pro-v1 */',
    `${extra}\n/* /lurvox-plan-pro-v1 */`
  )
}

let index = await getAsset(live.id, 'templates/index.json')
const durationMap = {
  '"plan_1_duration": "1 MONTH"': '"plan_1_duration": "1 Month"',
  '"plan_2_duration": "3 MONTHS"': '"plan_2_duration": "3 Months"',
  '"plan_3_duration": "6 MONTHS"': '"plan_3_duration": "6 Months"',
  '"plan_4_duration": "12 MONTHS"': '"plan_4_duration": "12 Months"',
}
for (const [from, to] of Object.entries(durationMap)) {
  index = index.split(from).join(to)
}

// Shorter mobile-friendly section subheadline
index = index.replace(
  /"subheadline":\s*"Same complete coaching on every plan — personal workout \+ diet, weekly coach reviews, daily trackers, coach chat, progress photos, and weekly plan updates\. Longer plans simply cost less per month\."/,
  '"subheadline": "Same full coaching on every plan. Longer plans cost less each month."'
)

await putAsset(live.id, 'blocks/ai_gen_block_361650c.liquid', block)
await putAsset(live.id, 'templates/index.json', index)

fs.mkdirSync('scripts/shopify-assets', { recursive: true })
fs.writeFileSync('scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid', block)
fs.writeFileSync('scripts/tmp-live-plan-block-361650c.liquid', block)
fs.writeFileSync('scripts/tmp-live-index.json', index)

console.log(
  JSON.stringify(
    {
      themeId: live.id,
      durations: [...index.matchAll(/"plan_\d_duration":\s*"[^"]+"/g)].map((m) => m[0]),
      urgencyHiddenMobile: block.includes('urgency-{{ ai_gen_id }} {\n    display: none'),
      shortSubhead: index.includes('Same full coaching on every plan'),
    },
    null,
    2
  )
)
