/**
 * Force plan prices to ₹999 / ₹1,699 / ₹2,999 everywhere on live MAIN + pages.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const APP = 'https://app.lurvox.in'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'scripts', 'shopify-assets')
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
  s.plan_2_price = '999'
  s.plan_2_original_price = '2499'
  s.plan_2_savings = '60% OFF · SAVE ₹1,500'
  s.plan_2_monthly = '≈ ₹333/month'
  s.plan_2_description = 'Quick Reset'
  s.plan_2_link = `${APP}/checkout?plan=3_months`

  s.plan_3_label = 'Recomposition Starter'
  s.plan_3_duration = '6 MONTHS'
  s.plan_3_price = '1699'
  s.plan_3_original_price = '4249'
  s.plan_3_savings = '60% OFF · SAVE ₹2,550'
  s.plan_3_monthly = '≈ ₹283/month'
  s.plan_3_description = 'Recomposition Starter'
  s.plan_3_link = `${APP}/checkout?plan=6_months`

  s.plan_4_label = 'Complete Transformation'
  s.plan_4_duration = '12 MONTHS'
  s.plan_4_price = '2999'
  s.plan_4_original_price = '7499'
  s.plan_4_savings = '60% OFF · SAVE ₹4,500'
  s.plan_4_monthly = '≈ ₹250/month'
  s.plan_4_description = 'Complete Transformation'
  s.plan_4_link = `${APP}/checkout?plan=12_months`

  if ('subheadline' in s) {
    s.subheadline =
      'Quick Reset · Recomposition Starter · Complete Transformation — WELCOME60 = 60% off'
  }
  if ('col_1_price' in s) s.col_1_price = '₹999'
  if ('col_2_price' in s) s.col_2_price = '₹1,699'
  if ('col_3_price' in s) s.col_3_price = '₹2,999'
}

/** Rewrite old sale/list copy → new. Order: highest old prices first so chains don't collide. */
function rewritePriceText(text) {
  if (!text || typeof text !== 'string') return text
  let next = text
  const pairs = [
    [/₹\s*3,?699/gi, '₹2,999'],
    [/₹\s*2,?699/gi, '₹1,699'],
    [/₹\s*1,?699/gi, '₹999'],
    [/₹\s*3,?599/gi, '₹2,999'],
    [/₹\s*2,?599/gi, '₹1,699'],
    [/₹\s*1,?999/gi, '₹999'],
    [/₹\s*9,?249/gi, '₹7,499'],
    [/₹\s*6,?749/gi, '₹4,249'],
    [/Rs\.?\s*3,?699/gi, 'Rs 2999'],
    [/Rs\.?\s*2,?699/gi, 'Rs 1699'],
    [/Rs\.?\s*1,?699/gi, 'Rs 999'],
    [/"3699"/g, '"2999"'],
    [/"2699"/g, '"1699"'],
    [/"1699"/g, '"999"'],
    [/"3599"/g, '"2999"'],
    [/"2599"/g, '"1699"'],
    [/"1999"/g, '"999"'],
    [/"9249"/g, '"7499"'],
    [/"6749"/g, '"4249"'],
    [/≈\s*₹566\/month/gi, '≈ ₹333/month'],
    [/≈\s*₹450\/month/gi, '≈ ₹283/month'],
    [/≈\s*₹308\/month/gi, '≈ ₹250/month'],
    [/From ₹566\/mo/gi, 'From ₹333/mo'],
    [/from ₹566\/mo/gi, 'from ₹333/mo'],
    [/≈ ₹19\/day/gi, '≈ ₹333/mo'],
    [/≈ ₹15\/day/gi, '≈ ₹283/mo'],
    [/≈ ₹10\/day/gi, '≈ ₹250/mo'],
    [/data-value="3699"/g, 'data-value="2999"'],
    [/data-value="2699"/g, 'data-value="1699"'],
    [/data-value="1699"/g, 'data-value="999"'],
    [/SAVE ₹5,?550/gi, 'SAVE ₹4,500'],
    [/SAVE ₹4,?050/gi, 'SAVE ₹2,550'],
    [/SAVE ₹2,?550/gi, 'SAVE ₹1,500'],
  ]
  for (const [re, to] of pairs) next = next.replace(re, to)
  return next
}

const localUploads = [
  ['snippets/lurvox-conversion-boost.liquid', 'snippets-lurvox-conversion-boost.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'snippets-lurvox-sales-closer.liquid'],
  ['sections/lurvox-ad-landing.liquid', 'sections-lurvox-ad-landing.liquid'],
  ['blocks/ai_gen_block_361650c.liquid', 'blocks-ai_gen_block_361650c.liquid'],
]
for (const [key, file] of localUploads) {
  const full = path.join(ASSETS, file)
  if (!fs.existsSync(full)) {
    console.warn('missing local asset', file)
    continue
  }
  await put(key, fs.readFileSync(full, 'utf8'))
}

for (const key of ['templates/index.json', 'templates/page.json']) {
  const raw = await get(key)
  if (!raw) continue
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    continue
  }
  let changed = false
  for (const section of Object.values(json.sections || {})) {
    for (const block of Object.values(section.blocks || {})) {
      if (!block?.settings) continue
      const s = block.settings
      const isPlanBlock =
        'plan_2_price' in s || 'plan_3_price' in s || 'plan_4_price' in s
      if (isPlanBlock) {
        applyPlanSettings(s)
        changed = true
        continue
      }
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'string') {
          const next = rewritePriceText(v)
          if (next !== v) {
            s[k] = next
            changed = true
          }
        }
      }
    }
    if (section.settings) {
      for (const [k, v] of Object.entries(section.settings)) {
        if (typeof v === 'string') {
          const next = rewritePriceText(v)
          if (next !== v) {
            section.settings[k] = next
            changed = true
          }
        }
      }
    }
  }
  if (changed) await put(key, JSON.stringify(json))
}

const scanKeys = [
  'layout/theme.liquid',
  'sections/header-group.json',
  'sections/footer-group.json',
  'templates/page.plans.json',
  'templates/page.coaching-plans.json',
  'templates/page.start.json',
]
for (const key of scanKeys) {
  const raw = await get(key)
  if (!raw) continue
  const next = rewritePriceText(raw)
  if (next !== raw) await put(key, next)
}

const pagesData = await gql(`{
  pages(first: 50) {
    nodes { id handle body }
  }
}`)
for (const page of pagesData.pages.nodes) {
  if (!page.body) continue
  const next = rewritePriceText(page.body)
  if (next === page.body) continue
  const result = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`,
    { id: page.id, page: { body: next } }
  )
  const errs = result.pageUpdate?.userErrors ?? []
  if (errs.length) console.warn('page errors', page.handle, errs)
  else console.log('updated page', page.handle)
}

const home = await fetch(`https://www.lurvox.in/?v=${Date.now()}`, {
  headers: { 'Cache-Control': 'no-cache' },
})
const html = await home.text()
console.log({
  homeStatus: home.status,
  has999: /₹\s*999|Rs\.?\s*999|>999</.test(html),
  has1699: /₹\s*1,?699/.test(html),
  has2999: /₹\s*2,?999/.test(html),
  hasOld2699: /₹\s*2,?699/.test(html),
  hasOld3699: /₹\s*3,?699/.test(html),
  hasOld566: /566\/mo/.test(html),
})
