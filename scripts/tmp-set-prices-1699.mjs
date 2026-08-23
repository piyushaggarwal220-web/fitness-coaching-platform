/**
 * Force plan prices to ₹1699 / ₹2699 / ₹3699 everywhere on live MAIN + pages.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
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
  const text = await res.text()
  if (!text?.trim()) return null
  try {
    return JSON.parse(text).asset?.value ?? null
  } catch {
    console.log('skip non-json', key)
    return null
  }
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

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

function applyPlanSettings(s) {
  s.plan_1_enabled = false
  s.plan_2_label = 'Quick Reset'
  s.plan_2_duration = '3 MONTHS'
  s.plan_2_price = '1699'
  s.plan_2_original_price = '4249'
  s.plan_2_savings = '60% OFF · SAVE ₹2,550'
  s.plan_2_monthly = '≈ ₹566/month'
  s.plan_2_description = 'Quick Reset'
  s.plan_2_link = `${APP}/checkout?plan=3_months`

  s.plan_3_label = 'Recomposition Starter'
  s.plan_3_duration = '6 MONTHS'
  s.plan_3_price = '2699'
  s.plan_3_original_price = '6749'
  s.plan_3_savings = '60% OFF · SAVE ₹4,050'
  s.plan_3_monthly = '≈ ₹450/month'
  s.plan_3_description = 'Recomposition Starter'
  s.plan_3_link = `${APP}/checkout?plan=6_months`

  s.plan_4_label = 'Complete Transformation'
  s.plan_4_duration = '12 MONTHS'
  s.plan_4_price = '3699'
  s.plan_4_original_price = '9249'
  s.plan_4_savings = '60% OFF · SAVE ₹5,550'
  s.plan_4_monthly = '≈ ₹308/month'
  s.plan_4_description = 'Complete Transformation'
  s.plan_4_link = `${APP}/checkout?plan=12_months`

  if ('subheadline' in s) {
    s.subheadline =
      'Quick Reset · Recomposition Starter · Complete Transformation — WELCOME60 = 60% off'
  }
  if ('col_1_price' in s) s.col_1_price = '₹1,699'
  if ('col_2_price' in s) s.col_2_price = '₹2,699'
  if ('col_3_price' in s) s.col_3_price = '₹3,699'
}

function rewritePriceText(text) {
  if (!text || typeof text !== 'string') return text
  let next = text
  const pairs = [
    [/₹\s*1,?999/gi, '₹1,699'],
    [/₹\s*2,?599/gi, '₹2,699'],
    [/₹\s*3,?599/gi, '₹3,699'],
    [/₹\s*1,?499/gi, '₹1,699'],
    [/₹\s*2,?499/gi, '₹2,699'],
    [/₹\s*3,?999/gi, '₹3,699'],
    [/₹\s*1,?500/gi, '₹1,699'],
    [/₹\s*2,?500/gi, '₹2,699'],
    [/₹\s*4,?000/gi, '₹3,699'],
    [/Rs\.?\s*1,?999/gi, 'Rs 1699'],
    [/Rs\.?\s*2,?599/gi, 'Rs 2699'],
    [/Rs\.?\s*3,?599/gi, 'Rs 3699'],
    [/Rs\.?\s*1,?499/gi, 'Rs 1699'],
    [/Rs\.?\s*2,?499/gi, 'Rs 2699'],
    [/Rs\.?\s*3,?999/gi, 'Rs 3699'],
    [/Rs\.?\s*1,?500/gi, 'Rs 1699'],
    [/Rs\.?\s*2,?500/gi, 'Rs 2699'],
    [/Rs\.?\s*4,?000/gi, 'Rs 3699'],
    [/"1999"/g, '"1699"'],
    [/"2599"/g, '"2699"'],
    [/"3599"/g, '"3699"'],
    [/"1499"/g, '"1699"'],
    [/"2499"/g, '"2699"'],
    [/"3999"/g, '"3699"'],
    [/"1500"/g, '"1699"'],
    [/"2500"/g, '"2699"'],
    [/"4000"/g, '"3699"'],
    [/≈\s*₹666\/month/gi, '≈ ₹566/month'],
    [/≈\s*₹433\/month/gi, '≈ ₹450/month'],
    [/≈\s*₹300\/month/gi, '≈ ₹308/month'],
    [/≈\s*Rs\.?\s*666\/month/gi, '≈ Rs 566/month'],
    [/≈\s*Rs\.?\s*433\/month/gi, '≈ Rs 450/month'],
    [/≈\s*Rs\.?\s*300\/month/gi, '≈ Rs 308/month'],
    [/SAVE ₹3,000/gi, 'SAVE ₹2,550'],
    [/SAVE ₹3,900/gi, 'SAVE ₹4,050'],
    [/SAVE ₹5,400/gi, 'SAVE ₹5,550'],
    [/"4999"/g, '"4249"'],
    [/"6499"/g, '"6749"'],
    [/"8999"/g, '"9249"'],
  ]
  for (const [re, rep] of pairs) next = next.replace(re, rep)
  return next
}

const jsonKeys = [
  'templates/index.json',
  'templates/page.json',
  'templates/page.plans.json',
  'templates/page.coaching-plans.json',
  'sections/header-group.json',
  'sections/footer-group.json',
]

for (const key of jsonKeys) {
  const raw = await get(key)
  if (!raw) {
    console.log('skip missing', key)
    continue
  }
  let changed = false
  let out = raw
  try {
    const data = JSON.parse(raw)
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) {
        node.forEach(walk)
        return
      }
      if (node.settings && typeof node.settings === 'object') {
        const s = node.settings
        if ('plan_2_price' in s || 'plan_3_price' in s || 'plan_4_price' in s || 'col_1_price' in s) {
          applyPlanSettings(s)
          changed = true
        }
        for (const [k, v] of Object.entries(s)) {
          if (typeof v === 'string') {
            const n = rewritePriceText(v)
            if (n !== v) {
              s[k] = n
              changed = true
            }
          }
        }
      }
      Object.values(node).forEach(walk)
    }
    walk(data)
    if (changed) out = JSON.stringify(data, null, 2)
  } catch {
    const n = rewritePriceText(raw)
    if (n !== raw) {
      out = n
      changed = true
    }
  }
  if (changed) await put(key, out)
  else console.log('ok', key)
}

const liquidKeys = [
  'blocks/ai_gen_block_361650c.liquid',
  'sections/lurvox-plan-compare.liquid',
  'snippets/lurvox-plan-compare-inline.liquid',
  'sections/lurvox-home-redesign.liquid',
]
for (const key of liquidKeys) {
  const raw = await get(key)
  if (!raw) {
    console.log('skip missing', key)
    continue
  }
  let next = rewritePriceText(raw)
  next = next
    .replace(/("id": "plan_2_price"[\s\S]*?"default":\s*")[^"]*(")/, '$11699$2')
    .replace(/("id": "plan_3_price"[\s\S]*?"default":\s*")[^"]*(")/, '$12699$2')
    .replace(/("id": "plan_4_price"[\s\S]*?"default":\s*")[^"]*(")/, '$13699$2')
    .replace(/("id": "col_1_price"[\s\S]*?"default":\s*")[^"]*(")/, '$1₹1,699$2')
    .replace(/("id": "col_2_price"[\s\S]*?"default":\s*")[^"]*(")/, '$1₹2,699$2')
    .replace(/("id": "col_3_price"[\s\S]*?"default":\s*")[^"]*(")/, '$1₹3,699$2')
  if (next !== raw) await put(key, next)
  else console.log('ok', key)
}

const PLANS_BODY = `<div class="lurvox-plans-rte">
<ul>
<li style="margin-bottom:10px;"><strong>3 Months — Quick Reset — ₹1,699</strong> (≈ ₹566/month · 60% OFF with WELCOME60)<br/><a href="${APP}/checkout?plan=3_months">Start 3 Months →</a></li>
<li style="margin-bottom:10px;"><strong>6 Months — Recomposition Starter — ₹2,699</strong> (≈ ₹450/month · 60% OFF with WELCOME60) · Most popular<br/><a href="${APP}/checkout?plan=6_months">Start 6 Months →</a></li>
<li style="margin-bottom:10px;"><strong>12 Months — Complete Transformation — ₹3,699</strong> (≈ ₹308/month · 60% OFF with WELCOME60) · Best value<br/><a href="${APP}/checkout?plan=12_months">Start 12 Months →</a></li>
</ul>
</div>`

const pagesData = await gql(`{ pages(first: 80) { nodes { id handle title body } } }`)
for (const page of pagesData.pages.nodes) {
  const handle = page.handle
  const body = page.body || ''
  const isPlans =
    handle === 'plans' ||
    handle === 'coaching-plans' ||
    handle === 'pricing' ||
    handle.startsWith('plans')
  const hasOld = /1,?999|2,?599|3,?599|1,?499|2,?499|3,?999|1,?500|2,?500|4,?000/.test(body)
  if (!isPlans && !hasOld) continue
  const nextBody = isPlans && (handle === 'plans' || handle === 'coaching-plans' || handle === 'pricing' || handle.startsWith('plans'))
    ? PLANS_BODY
    : rewritePriceText(body)
  if (nextBody === body) {
    console.log('page ok', handle)
    continue
  }
  const updated = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`,
    { id: page.id, page: { body: nextBody } }
  )
  if (updated.pageUpdate.userErrors?.length) {
    throw new Error(`${handle}: ${JSON.stringify(updated.pageUpdate.userErrors)}`)
  }
  console.log('updated page', handle)
}

console.log('done')
