import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const SOURCE = '161375289595' // New changes draft
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = await (await fetch(`${REST}/themes.json`, { headers })).json()
const main = themes.themes.find((theme) => theme.role === 'main')
console.log('main', main.id, main.name)

async function get(themeId, key) {
  const response = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const json = await response.json()
  return json.asset?.value ?? null
}

async function put(themeId, key, value) {
  const response = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 300)}`)
  console.log('updated', key)
}

function findPlanSettings(index) {
  for (const section of Object.values(index.sections ?? {})) {
    for (const block of Object.values(section.blocks ?? {})) {
      if (block.type === 'ai_gen_block_361650c') return block.settings
    }
  }
  return null
}

const sourceIndex = JSON.parse(await get(SOURCE, 'templates/index.json'))
const sourcePlan = findPlanSettings(sourceIndex)
if (!sourcePlan) throw new Error('source plan settings not found')

const liveIndex = JSON.parse(await get(main.id, 'templates/index.json'))
let applied = false

for (const section of Object.values(liveIndex.sections ?? {})) {
  for (const block of Object.values(section.blocks ?? {})) {
    if (block.type !== 'ai_gen_block_361650c' || !block.settings) continue
    block.settings = { ...block.settings, ...sourcePlan }
    block.settings.plan_1_enabled = false
    block.settings.subheadline =
      'Pick 3 / 6 / 12 months. Same full coaching on every plan. Use WELCOME60 for 60% off.'
    if (/cart/i.test(block.settings.cta_text ?? '')) block.settings.cta_text = 'CONTINUE'
    applied = true
  }
}

if (!applied) throw new Error('live plan block not found')

await put(main.id, 'templates/index.json', JSON.stringify(liveIndex, null, 2))

const verify = JSON.parse(await get(main.id, 'templates/index.json'))
const verified = findPlanSettings(verify)
console.log(
  JSON.stringify(
    {
      trialEnabled: verified.plan_1_enabled,
      prices: [verified.plan_2_price, verified.plan_3_price, verified.plan_4_price],
      mrp: [
        verified.plan_2_original_price,
        verified.plan_3_original_price,
        verified.plan_4_original_price,
      ],
      links: [verified.plan_2_link, verified.plan_3_link, verified.plan_4_link],
      subheadline: verified.subheadline,
      urgency: verified.urgency_label,
    },
    null,
    2
  )
)
