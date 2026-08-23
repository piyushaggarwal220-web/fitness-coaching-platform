/**
 * Set visible plan prices to ₹1499 / ₹2499 / ₹3999 on live MAIN
 * (homepage plan block + plans / coaching-plans pages).
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

  s.plan_2_price = '1499'
  s.plan_2_original_price = '3750'
  s.plan_2_savings = '60% OFF with WELCOME60 · SAVE ₹2,251'
  s.plan_2_monthly = '≈ ₹500/month'
  s.plan_2_link = `${APP}/checkout?plan=3_months`

  s.plan_3_price = '2499'
  s.plan_3_original_price = '6250'
  s.plan_3_savings = '60% OFF with WELCOME60 · SAVE ₹3,751'
  s.plan_3_monthly = '≈ ₹417/month'
  s.plan_3_link = `${APP}/checkout?plan=6_months`

  s.plan_4_price = '3999'
  s.plan_4_original_price = '10000'
  s.plan_4_savings = '60% OFF with WELCOME60 · SAVE ₹6,001'
  s.plan_4_monthly = '≈ ₹333/month'
  s.plan_4_link = `${APP}/checkout?plan=12_months`

  if (typeof s.subheadline === 'string') {
    s.subheadline =
      'Pick 3 / 6 / 12 months. Same full coaching on every plan. Use WELCOME60 for 60% off.'
  }
  return {
    prices: [s.plan_2_price, s.plan_3_price, s.plan_4_price],
    mrp: [s.plan_2_original_price, s.plan_3_original_price, s.plan_4_original_price],
  }
}

// --- Homepage plan cards ---
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

// --- Plans pages (RTE) via Admin GraphQL pages ---
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
<li style="margin-bottom:10px;"><strong>3 Months — ₹1,499</strong> (≈ ₹500/month · 60% OFF with WELCOME60)<br/><a href="${APP}/checkout?plan=3_months">Start 3 Months →</a></li>
<li style="margin-bottom:10px;"><strong>6 Months — ₹2,499</strong> (≈ ₹417/month · 60% OFF with WELCOME60) · Most popular<br/><a href="${APP}/checkout?plan=6_months">Start 6 Months →</a></li>
<li style="margin-bottom:10px;"><strong>12 Months — ₹3,999</strong> (≈ ₹333/month · 60% OFF with WELCOME60) · Best value<br/><a href="${APP}/checkout?plan=12_months">Start 12 Months →</a></li>
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
    {
      id: page.id,
      page: { body: PLANS_BODY },
    }
  )
  const errs = updated.pageUpdate.userErrors
  if (errs?.length) throw new Error(`${page.handle}: ${JSON.stringify(errs)}`)
  console.log('updated page', page.handle)
}

console.log('done')
