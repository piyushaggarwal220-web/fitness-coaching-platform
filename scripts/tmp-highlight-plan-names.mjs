/**
 * Highlight plan tier names (Quick Reset / Recomposition Starter / Complete Transformation)
 * on the live plan cards — they were dimmed by the mobile CSS override.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

const key = 'blocks/ai_gen_block_361650c.liquid'
const getRes = await fetch(
  `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers }
)
const getJson = await getRes.json()
let liquid = getJson.asset?.value
if (!liquid) throw new Error('Missing liquid asset')

const baseOld = `  .ai-transformation-plan-card-label-{{ ai_gen_id }} {
    font-size: 11px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: {{ block.settings.text_color }};
    font-weight: 700;
  }`

const baseNew = `  .ai-transformation-plan-card-label-{{ ai_gen_id }} {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: none;
    color: #ff8a3d;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 98, 0, 0.18);
    border: 1px solid rgba(255, 98, 0, 0.45);
  }`

const overrideOld = `  .ai-transformation-plan-card-label-{{ ai_gen_id }} {
    font-size: 10px !important;
    letter-spacing: 0.12em !important;
    font-weight: 650 !important;
    color: rgba(255, 255, 255, 0.55) !important;
  }`

const overrideNew = `  .ai-transformation-plan-card-label-{{ ai_gen_id }} {
    font-size: 11px !important;
    letter-spacing: 0.06em !important;
    font-weight: 800 !important;
    color: #ff9a55 !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 4px 9px !important;
    border-radius: 999px !important;
    background: rgba(255, 98, 0, 0.2) !important;
    border: 1px solid rgba(255, 98, 0, 0.5) !important;
    text-transform: none !important;
    max-width: 100%;
    line-height: 1.25 !important;
  }`

if (!liquid.includes(baseOld) && !liquid.includes('color: #ff8a3d')) {
  // Try looser match if whitespace differs
  const loose = /  \.ai-transformation-plan-card-label-\{\{ ai_gen_id \}\} \{[\s\S]*?font-weight:\s*700;\s*\}/
  if (!loose.test(liquid)) throw new Error('Base label CSS not found')
}

let next = liquid
if (next.includes(baseOld)) {
  next = next.replace(baseOld, baseNew)
  console.log('patched base label')
} else if (next.includes('color: #ff8a3d')) {
  console.log('base already highlighted')
} else {
  next = next.replace(
    /  \.ai-transformation-plan-card-label-\{\{ ai_gen_id \}\} \{[\s\S]*?font-weight:\s*700;\s*\}/,
    baseNew
  )
  console.log('patched base label (loose)')
}

if (next.includes(overrideOld)) {
  next = next.replace(overrideOld, overrideNew)
  console.log('patched override label')
} else if (next.includes('color: #ff9a55 !important')) {
  console.log('override already highlighted')
} else {
  next = next.replace(
    /  \.ai-transformation-plan-card-label-\{\{ ai_gen_id \}\} \{[\s\S]*?color:\s*rgba\(255,\s*255,\s*255,\s*0\.55\)\s*!important;\s*\}/,
    overrideNew
  )
  console.log('patched override label (loose)')
}

if (next === liquid) throw new Error('No CSS changes applied')

const putRes = await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key, value: next } }),
})
const putJson = await putRes.json()
if (!putRes.ok || putJson.errors) throw new Error(JSON.stringify(putJson).slice(0, 400))
console.log('updated', key)

// Also brighten the subheadline tier list above cards if present
const indexKey = 'templates/index.json'
const indexRes = await fetch(
  `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(indexKey)}&t=${Date.now()}`,
  { headers }
)
const indexJson = await indexRes.json()
const index = JSON.parse(indexJson.asset.value)
let touched = false
for (const section of Object.values(index.sections ?? {})) {
  for (const block of Object.values(section.blocks ?? {})) {
    if (!block?.settings || !('plan_2_label' in block.settings)) continue
    block.settings.plan_2_label = 'Quick Reset'
    block.settings.plan_3_label = 'Recomposition Starter'
    block.settings.plan_4_label = 'Complete Transformation'
    // Keep names above cards too, short and clear
    block.settings.subheadline =
      'Quick Reset · Recomposition Starter · Complete Transformation — WELCOME60 = 60% off'
    touched = true
  }
}
if (touched) {
  const putIndex = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key: indexKey, value: JSON.stringify(index, null, 2) } }),
  })
  const putIndexJson = await putIndex.json()
  if (!putIndex.ok || putIndexJson.errors) throw new Error(JSON.stringify(putIndexJson).slice(0, 400))
  console.log('refreshed index labels')
}

console.log('done')
