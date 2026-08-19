/**
 * Force plan prices to ₹999 / ₹1,699 / ₹2,999 everywhere on live MAIN + pages.
 *
 * Auth (first match wins):
 * - SHOPIFY_ADMIN_ACCESS_TOKEN env
 * - $TEMP/shopify-auth-token.json (or /tmp/shopify-auth-token.json)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const APP = 'https://app.lurvox.in'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'scripts', 'shopify-assets')
const TEMP_DIR = process.env.TEMP || process.env.TMPDIR || '/tmp'

function loadToken() {
  const fromEnv = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim()
  if (fromEnv) return fromEnv
  const tokenPath = path.join(TEMP_DIR, 'shopify-auth-token.json')
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Missing Shopify token. Set SHOPIFY_ADMIN_ACCESS_TOKEN or write ${tokenPath}`
    )
  }
  return JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token
}

const token = loadToken()
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

/**
 * Rewrite old sale copy → ₹999 / ₹1,699 / ₹2,999.
 * Uses placeholders so chained replaces cannot collide (e.g. 2699→1699→999).
 */
function rewritePriceText(text) {
  if (!text || typeof text !== 'string') return text
  let next = text
  const pairs = [
    // Current live sale prices (Aug 2026)
    [/₹\s*3,?999/gi, '__LX_P12__'],
    [/₹\s*2,?699/gi, '__LX_P6__'],
    [/₹\s*1,?499/gi, '__LX_P3__'],
    [/Rs\.?\s*3,?999/gi, '__LX_RS12__'],
    [/Rs\.?\s*2,?699/gi, '__LX_RS6__'],
    [/Rs\.?\s*1,?499/gi, '__LX_RS3__'],
    [/"3999"/g, '"__LX_N12__"'],
    [/"2699"/g, '"__LX_N6__"'],
    [/"1499"/g, '"__LX_N3__"'],
    [/data-value="3999"/g, 'data-value="__LX_N12__"'],
    [/data-value="2699"/g, 'data-value="__LX_N6__"'],
    [/data-value="1499"/g, 'data-value="__LX_N3__"'],
    [/data-plan-price="3999"/g, 'data-plan-price="__LX_N12__"'],
    [/data-plan-price="2699"/g, 'data-plan-price="__LX_N6__"'],
    [/data-plan-price="1499"/g, 'data-plan-price="__LX_N3__"'],
    // Older sale ladders
    [/₹\s*3,?699/gi, '__LX_P12__'],
    [/₹\s*3,?499/gi, '__LX_P12__'],
    [/₹\s*3,?599/gi, '__LX_P12__'],
    [/₹\s*2,?099/gi, '__LX_P6__'],
    [/₹\s*2,?599/gi, '__LX_P6__'],
    [/₹\s*1,?299/gi, '__LX_P3__'],
    [/₹\s*1,?999/gi, '__LX_P3__'],
    [/Rs\.?\s*3,?699/gi, '__LX_RS12__'],
    [/Rs\.?\s*2,?099/gi, '__LX_RS6__'],
    [/Rs\.?\s*1,?299/gi, '__LX_RS3__'],
    [/"3699"/g, '"__LX_N12__"'],
    [/"3499"/g, '"__LX_N12__"'],
    [/"3599"/g, '"__LX_N12__"'],
    [/"2099"/g, '"__LX_N6__"'],
    [/"2599"/g, '"__LX_N6__"'],
    [/"1299"/g, '"__LX_N3__"'],
    [/"1999"/g, '"__LX_N3__"'],
    [/data-value="3699"/g, 'data-value="__LX_N12__"'],
    [/data-value="2099"/g, 'data-value="__LX_N6__"'],
    [/data-value="1299"/g, 'data-value="__LX_N3__"'],
    // Monthly / day copy for current + older sales (placeholders avoid 500→333→250 chains)
    [/≈\s*₹500\/mo(?:nth)?/gi, '__LX_M3__'],
    [/≈\s*₹450\/mo(?:nth)?/gi, '__LX_M6__'],
    [/≈\s*₹333\/mo(?:nth)?/gi, '__LX_M12__'],
    [/≈\s*₹566\/month/gi, '__LX_M3__'],
    [/≈\s*₹350\/month/gi, '__LX_M6__'],
    [/≈\s*₹308\/month/gi, '__LX_M12__'],
    [/≈\s*₹292\/month/gi, '__LX_M12__'],
    [/₹500\/mo/gi, '__LX_MS3__'],
    [/₹450\/mo/gi, '__LX_MS6__'],
    [/₹333\/mo/gi, '__LX_MS12__'],
    [/From ₹566\/mo/gi, 'From ₹333/mo'],
    [/from ₹566\/mo/gi, 'from ₹333/mo'],
    [/≈ ₹19\/day/gi, '≈ ₹333/mo'],
    [/≈ ₹15\/day/gi, '≈ ₹283/mo'],
    [/≈ ₹10\/day/gi, '≈ ₹250/mo'],
    // Placeholders → final prices
    [/__LX_P12__/g, '₹2,999'],
    [/__LX_P6__/g, '₹1,699'],
    [/__LX_P3__/g, '₹999'],
    [/__LX_RS12__/g, 'Rs 2999'],
    [/__LX_RS6__/g, 'Rs 1699'],
    [/__LX_RS3__/g, 'Rs 999'],
    [/__LX_N12__/g, '2999'],
    [/__LX_N6__/g, '1699'],
    [/__LX_N3__/g, '999'],
    [/__LX_M3__/g, '≈ ₹333/month'],
    [/__LX_M6__/g, '≈ ₹283/month'],
    [/__LX_M12__/g, '≈ ₹250/month'],
    [/__LX_MS3__/g, '₹333/mo'],
    [/__LX_MS6__/g, '₹283/mo'],
    [/__LX_MS12__/g, '₹250/mo'],
  ]
  for (const [re, to] of pairs) next = next.replace(re, to)
  return next
}

const localUploads = [
  ['snippets/lurvox-conversion-boost.liquid', 'snippets-lurvox-conversion-boost.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'snippets-lurvox-sales-closer.liquid'],
  ['snippets/lurvox-plan-compare-inline.liquid', 'snippets-lurvox-plan-compare-inline.liquid'],
  ['sections/lurvox-ad-landing.liquid', 'sections-lurvox-ad-landing.liquid'],
  ['sections/lurvox-plan-finder.liquid', 'sections-lurvox-plan-finder.liquid'],
  ['sections/lurvox-plan-compare.liquid', 'sections-lurvox-plan-compare.liquid'],
  ['blocks/ai_gen_block_361650c.liquid', 'blocks-ai_gen_block_361650c.liquid'],
  ['templates/page.compare-plans.json', 'templates-page.compare-plans.json'],
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
  'templates/page.compare-plans.json',
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
const report = {
  homeStatus: home.status,
  has999: /₹\s*999|Rs\.?\s*999|>999</.test(html),
  has1699: /₹\s*1,?699/.test(html),
  has2999: /₹\s*2,?999/.test(html),
  hasOld1499: /₹\s*1,?499/.test(html),
  hasOld2699: /₹\s*2,?699/.test(html),
  hasOld3999: /₹\s*3,?999/.test(html),
  card1499: /data-plan-price="1499"/.test(html),
  card999: /data-plan-price="999"/.test(html),
}
console.log(report)
if (report.hasOld1499 || report.hasOld2699 || report.hasOld3999 || report.card1499) {
  process.exitCode = 2
}
