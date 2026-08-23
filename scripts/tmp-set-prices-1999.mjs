/**
 * Set plan prices to ₹1999 / ₹2599 / ₹3599 and card names:
 * Quick Reset / Recomposition Starter / Complete Transformation
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const json = await res.json()
  return json.asset?.value ?? null
}

async function put(key, value) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 400)}`)
  console.log('updated', key)
}

function applyPlanBlockSettings(s) {
  s.plan_1_enabled = false

  // Names live in the card label row (above duration).
  s.plan_2_label = 'Quick Reset'
  s.plan_2_duration = '3 MONTHS'
  s.plan_2_price = '1999'
  s.plan_2_original_price = '4999'
  s.plan_2_savings = '60% OFF · SAVE ₹3,000'
  s.plan_2_monthly = '≈ ₹666/month'
  s.plan_2_description = 'Quick Reset'
  s.plan_2_link = `${APP}/checkout?plan=3_months`

  s.plan_3_label = 'Recomposition Starter'
  s.plan_3_duration = '6 MONTHS'
  s.plan_3_price = '2599'
  s.plan_3_original_price = '6499'
  s.plan_3_savings = '60% OFF · SAVE ₹3,900'
  s.plan_3_monthly = '≈ ₹433/month'
  s.plan_3_description = 'Recomposition Starter'
  s.plan_3_link = `${APP}/checkout?plan=6_months`

  s.plan_4_label = 'Complete Transformation'
  s.plan_4_duration = '12 MONTHS'
  s.plan_4_price = '3599'
  s.plan_4_original_price = '8999'
  s.plan_4_savings = '60% OFF · SAVE ₹5,400'
  s.plan_4_monthly = '≈ ₹300/month'
  s.plan_4_description = 'Complete Transformation'
  s.plan_4_link = `${APP}/checkout?plan=12_months`

  // Also surface names just above the cards (subheadline) if card labels wrap tightly.
  s.subheadline =
    'Quick Reset · Recomposition Starter · Complete Transformation — use WELCOME60 for 60% off.'

  return {
    labels: [s.plan_2_label, s.plan_3_label, s.plan_4_label],
    prices: [s.plan_2_price, s.plan_3_price, s.plan_4_price],
    mrp: [s.plan_2_original_price, s.plan_3_original_price, s.plan_4_original_price],
  }
}

const index = JSON.parse(await get('templates/index.json'))
let applied = 0
for (const section of Object.values(index.sections ?? {})) {
  for (const block of Object.values(section.blocks ?? {})) {
    if (!block?.settings) continue
    const hit =
      block.type === 'ai_gen_block_361650c' ||
      'plan_2_price' in block.settings ||
      'plan_3_price' in block.settings
    if (!hit) continue
    console.log('homepage block', block.type, applyPlanBlockSettings(block.settings))
    applied++
  }
}
if (!applied) throw new Error('Homepage plan block not found')
await put('templates/index.json', JSON.stringify(index, null, 2))

async function gql(query, variables) {
  const res = await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

const PLANS_BODY = `<div class="lurvox-plans-rte">
<ul>
<li style="margin-bottom:10px;"><strong>3 Months — Quick Reset — ₹1,999</strong> (≈ ₹666/month · 60% OFF with WELCOME60)<br/><a href="${APP}/checkout?plan=3_months">Start 3 Months →</a></li>
<li style="margin-bottom:10px;"><strong>6 Months — Recomposition Starter — ₹2,599</strong> (≈ ₹433/month · 60% OFF with WELCOME60) · Most popular<br/><a href="${APP}/checkout?plan=6_months">Start 6 Months →</a></li>
<li style="margin-bottom:10px;"><strong>12 Months — Complete Transformation — ₹3,599</strong> (≈ ₹300/month · 60% OFF with WELCOME60) · Best value<br/><a href="${APP}/checkout?plan=12_months">Start 12 Months →</a></li>
</ul>
</div>`

const pagesData = await gql(`{
  pages(first: 50) {
    nodes { id handle title body }
  }
}`)

const targetHandles = new Set(['plans', 'coaching-plans'])
for (const page of pagesData.pages.nodes) {
  if (!targetHandles.has(page.handle)) continue
  const updated = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`,
    { id: page.id, page: { body: PLANS_BODY } }
  )
  const errs = updated.pageUpdate.userErrors
  if (errs?.length) throw new Error(`${page.handle}: ${JSON.stringify(errs)}`)
  console.log('updated page', page.handle)
}

console.log('done')
