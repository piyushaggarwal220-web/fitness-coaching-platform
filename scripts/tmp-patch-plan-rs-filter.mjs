/**
 * Ensure plan monthly/savings render with Rs even if theme settings still have ₹.
 * Also bump cache via index touch already done.
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
const KEY = 'blocks/ai_gen_block_361650c.liquid'

const themes = await (await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })).json()
const live = themes.themes.find((t) => t.role === 'main')

const get = async () => {
  const res = await fetch(
    `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  return (await res.json()).asset.value
}

let block = await get()

const monthlyOld =
  `{% if plan_monthly != blank %}
                    <div class="ai-transformation-plan-card-monthly-{{ ai_gen_id }}">{{ plan_monthly }}</div>
                  {% endif %}`
const monthlyNew =
  `{% if plan_monthly != blank %}
                    <div class="ai-transformation-plan-card-monthly-{{ ai_gen_id }}">{{ plan_monthly | replace: '₹', 'Rs ' }}</div>
                  {% endif %}`

const savingsOld =
  `{% if plan_savings != blank %}
                    <div class="ai-transformation-plan-card-savings-{{ ai_gen_id }}">{{ plan_savings }}</div>
                  {% endif %}`
const savingsNew =
  `{% if plan_savings != blank %}
                    <div class="ai-transformation-plan-card-savings-{{ ai_gen_id }}">{{ plan_savings | replace: '₹', 'Rs ' }}</div>
                  {% endif %}`

if (!block.includes(monthlyOld) && !block.includes("replace: '₹', 'Rs '")) {
  throw new Error('Could not find monthly markup to patch')
}
if (block.includes(monthlyOld)) block = block.replace(monthlyOld, monthlyNew)
if (block.includes(savingsOld)) block = block.replace(savingsOld, savingsNew)

const put = await fetch(`${REST}/themes/${live.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: KEY, value: block } }),
})
if (!put.ok) throw new Error(`PUT ${put.status} ${(await put.text()).slice(0, 300)}`)

fs.writeFileSync('scripts/tmp-live-plan-block-361650c.liquid', block)
console.log(
  JSON.stringify(
    {
      themeId: live.id,
      hasReplaceFilter: block.includes("replace: '₹', 'Rs '"),
      hasRsPrice: /Rs \{\{\s*plan_price\s*\}\}/.test(block),
      hasV2: block.includes('lurvox-mobile-plan-cards-v2'),
    },
    null,
    2
  )
)
