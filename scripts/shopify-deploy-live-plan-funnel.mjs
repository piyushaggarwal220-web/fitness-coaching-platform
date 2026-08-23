/**
 * Live theme: goal-based plan pages, 10-q quiz → plan page, swipe, login polish.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function get(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  if (!res.ok) throw new Error(`get ${key}: ${res.status} ${await res.text()}`)
  return (await res.json()).asset.value
}

async function put(key, value) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`put ${key}: ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

const files = [
  ['sections/lurvox-plan-finder.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'],
  ['templates/page.find-your-plan.json', 'scripts/shopify-assets/templates-page.find-your-plan.json'],
  ['sections/lurvox-client-login.liquid', 'scripts/shopify-assets/sections-lurvox-client-login.liquid'],
  ['blocks/ai_gen_block_52353f6.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_52353f6.liquid'],
  ['snippets/lurvox-find-float.liquid', 'scripts/shopify-assets/snippets-lurvox-find-float.liquid'],
  ['snippets/lurvox-home-flow.liquid', 'scripts/shopify-assets/snippets-lurvox-home-flow.liquid'],
  ['snippets/lurvox-conversion-boost.liquid', 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'],
  ['snippets/lurvox-plan-compare-inline.liquid', 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'],
  ['sections/lurvox-plan-compare.liquid', 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'],
  ['sections/lurvox-how-it-works.liquid', 'scripts/shopify-assets/sections-lurvox-how-it-works.liquid'],
]

for (const [key, rel] of files) {
  await put(key, fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

function checkoutToPlan(url) {
  if (typeof url !== 'string') return url
  return url
    .replace(/https:\/\/app\.lurvox\.in\/checkout\?plan=3_months[^"']*/g, 'https://app.lurvox.in/plans/3-months')
    .replace(/https:\/\/app\.lurvox\.in\/checkout\?plan=6_months[^"']*/g, 'https://app.lurvox.in/plans/6-months')
    .replace(/https:\/\/app\.lurvox\.in\/checkout\?plan=12_months[^"']*/g, 'https://app.lurvox.in/plans/12-months')
}

function walkLinks(obj) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    obj.forEach(walkLinks)
    return
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') obj[k] = checkoutToPlan(v)
    else if (v && typeof v === 'object') walkLinks(v)
  }
}

const index = JSON.parse(await get('templates/index.json'))
walkLinks(index)
const plans = index.sections?.home_blocks_v2?.blocks?.ai_gen_block_361650c_qqYKXh
if (plans?.settings) {
  const s = plans.settings
  s.top_label = 'GOAL PLANS. NOT JUST TIMERS.'
  s.headline = 'Pick the goal. Duration is the runway.'
  s.subheadline =
    'Quick Reset · 90 day fat loss / habit. Recomposition · fat down, muscle up. Complete Transformation · all-in lifestyle change. WELCOME60 = 60% off'
  s.plan_2_label = 'Quick Reset'
  s.plan_2_badge = '90 DAY GOAL'
  s.plan_2_footer =
    'Best for lose fat / tone up. A 90 day reset with a coach, not a random 3 month timer.'
  s.plan_2_link = 'https://app.lurvox.in/plans/3-months'
  s.plan_3_label = 'Recomposition'
  s.plan_3_footer =
    'Best for fat down, muscle up. Six months so progress does not stall after the first 90 days.'
  s.plan_3_link = 'https://app.lurvox.in/plans/6-months'
  s.plan_4_label = 'Complete Transformation'
  s.plan_4_footer =
    'Best for an all-in lifestyle change. Weekly coach phone call. 12 month exclusive.'
  s.plan_4_link = 'https://app.lurvox.in/plans/12-months'
}
await put('templates/index.json', `${JSON.stringify(index, null, 2)}\n`)

for (const key of ['templates/page.compare-plans.json', 'templates/page.how-lurvox-works.json']) {
  try {
    const tpl = JSON.parse(await get(key))
    walkLinks(tpl)
    await put(key, `${JSON.stringify(tpl, null, 2)}\n`)
  } catch (e) {
    console.log('skip', key, e.message)
  }
}

try {
  const hg = JSON.parse(await get('sections/header-group.json'))
  if (hg.sections?.lurvox_client_login?.settings) {
    hg.sections.lurvox_client_login.settings.label = 'Log in'
    hg.sections.lurvox_client_login.settings.prompt = 'Already training with LURVOX?'
    await put('sections/header-group.json', `${JSON.stringify(hg, null, 2)}\n`)
  }
} catch (e) {
  console.log('header skip', e.message)
}

console.log('live', `https://www.lurvox.in/?v=planfunnel${Date.now()}`)
console.log('quiz', 'https://www.lurvox.in/pages/find-your-plan')
console.log('plan', 'https://app.lurvox.in/plans/3-months')
