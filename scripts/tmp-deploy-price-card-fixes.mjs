import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = [161429127419, 161391804667]

const SAFE_HIDE_CSS = `/* lurvox-hide-retired-plans-v2 */
  [data-plan-link*="trial"],
  [data-plan-link*="1_week_trial"],
  [data-plan-link*="1_month"],
  [data-plan-link*="1-month"],
  [data-plan-price="179"],
  [data-plan-price="499"],
  a[href*="plans/1-month"],
  a[href*="plan=1_month"],
  a[href*="1_week_trial"] {
    display: none !important;
  }
  [data-plan-link*="3_months"],
  [data-plan-link*="6_months"],
  [data-plan-link*="12_months"],
  [data-plan-price="999"],
  [data-plan-price="1699"],
  [data-plan-price="2999"] {
    display: block !important;
  }`

async function put(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(`${themeId} ${key} ${JSON.stringify(json).slice(0, 300)}`)
  }
  console.log('ok', themeId, key, value.length)
}

async function get(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`get ${themeId} ${key} ${JSON.stringify(json).slice(0, 200)}`)
  return json.asset.value
}

function patchBaseCss(css) {
  const blockRe =
    /\/\* lurvox-hide-1month-css-v1 \*\/[\s\S]*?\/\* lurvox-hide-1month-css-v1-end \*\//
  const replacement = `/* lurvox-hide-1month-css-v1 */
/* lurvox-hide-retired-plans-v2 */
[data-plan-link*="trial"],
[data-plan-link*="1_week_trial"],
[data-plan-link*="1_month"],
[data-plan-link*="1-month"],
[data-plan-price="179"],
[data-plan-price="499"],
a[href*="plans/1-month"],
a[href*="plan=1_month"] { display: none !important; }
[data-plan-link*="3_months"],
[data-plan-link*="6_months"],
[data-plan-link*="12_months"],
[data-plan-price="999"],
[data-plan-price="1699"],
[data-plan-price="2999"] { display: block !important; }
/* lurvox-hide-1month-css-v1-end */`
  if (blockRe.test(css)) return css.replace(blockRe, replacement)
  if (css.includes('lurvox-hide-1month-css-v1')) {
    throw new Error('base.css hide marker found but regex failed')
  }
  return css + '\n' + replacement + '\n'
}

function patchIndex(index) {
  let next = index
  // Replace old hide CSS blobs that still target price 999 / index 1 broadly
  const oldHidePatterns = [
    /\/\* Hide retired 1-month \+ 7-day trial from plan selector \*\/\\n\s*\[data-plan-index=\\"1\\"\],\\n\s*\[data-plan-price=\\"179\\"\],\\n\s*\[data-plan-price=\\"999\\"\],\\n\s*\[data-plan-price=\\"499\\"\],\\n\s*\[data-plan-link\*=\\"trial\\"\],\\n\s*\[data-plan-link\*=\\"1_week_trial\\"\] \{\\n\s*display: none !important;\\n\s*\}/g,
  ]

  const safeEscaped = SAFE_HIDE_CSS.replace(/\n/g, '\\n').replace(/"/g, '\\"')

  for (const re of oldHidePatterns) {
    if (re.test(next)) {
      next = next.replace(re, safeEscaped.replace(/\n/g, '\\n'))
    }
  }

  // Broader fallback replacements inside custom_liquid strings
  next = next.replace(
    /\[data-plan-index=\\"1\\"\],\\n\s*\[data-plan-price=\\"179\\"\],\\n\s*\[data-plan-price=\\"999\\"\],\\n\s*\[data-plan-price=\\"499\\"\],\\n\s*\[data-plan-link\*=\\"trial\\"\],\\n\s*\[data-plan-link\*=\\"1_week_trial\\"\] \{\\n\s*display: none !important;\\n\s*\}/g,
    safeEscaped
  )

  // Inline matrix Choose labels if present
  next = next.replace(
    /href=\\"https:\/\/app\.lurvox\.in\/plans\/3-months\\">Choose/g,
    'href=\\"https://app.lurvox.in/checkout?plan=3_months\\">Start · ₹999'
  )
  next = next.replace(
    /href=\\"https:\/\/app\.lurvox\.in\/plans\/6-months\\">Choose/g,
    'href=\\"https://app.lurvox.in/checkout?plan=6_months\\">Start · ₹1,699'
  )
  next = next.replace(
    /href=\\"https:\/\/app\.lurvox\.in\/plans\/12-months\\">Choose/g,
    'href=\\"https://app.lurvox.in/checkout?plan=12_months\\">Start · ₹2,999'
  )

  // Ensure inline matrix has id=plans
  next = next.replace(
    '<section class=\\"lx-matrix\\" aria-labelledby=\\"lx-matrix-title\\">',
    '<section class=\\"lx-matrix\\" id=\\"plans\\" aria-labelledby=\\"lx-matrix-title\\">'
  )

  return next
}

function patchLivePlanBlock(liquid) {
  let next = liquid
  next = next.replace(
    /Rs&nbsp;\{\{\s*plan_original_price\s*\}\}/g,
    '₹{{ plan_original_price }}'
  )
  next = next.replace(
    /(<div class="ai-transformation-plan-card-price-\{\{\s*ai_gen_id\s*\}\}">)Rs&nbsp;\{\{\s*plan_price\s*\}\}/g,
    '$1₹{{ plan_price }}'
  )
  next = next.replace(
    /\{\{\s*plan_monthly\s*\|\s*replace:\s*'₹',\s*'Rs '\s*\}\}/g,
    "{{ plan_monthly | replace: 'Rs ', '₹' | replace: 'Rs', '₹' }}"
  )
  next = next.replace(
    /\{\{\s*plan_savings\s*\|\s*replace:\s*'₹',\s*'Rs '\s*\}\}/g,
    "{{ plan_savings | replace: 'Rs ', '₹' | replace: 'Rs', '₹' }}"
  )
  return next
}

const hideSection = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-hide-1month.liquid'),
  'utf8'
)
const closer = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'),
  'utf8'
)
const matrix = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
  'utf8'
)
const planBlockLocal = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'),
  'utf8'
)

if (!hideSection.includes('lurvox-hide-retired-plans-v2')) {
  throw new Error('hide section missing v2')
}
if (!closer.includes('Recomposition Starter') || !closer.includes('Complete Transformation')) {
  throw new Error('closer names incomplete')
}
if (!matrix.includes('Start · ₹999')) throw new Error('matrix choose labels missing')

for (const themeId of themes) {
  await put(themeId, 'sections/lurvox-hide-1month.liquid', hideSection)
  await put(themeId, 'snippets/lurvox-sales-closer.liquid', closer)
  await put(themeId, 'snippets/lurvox-plan-compare-inline.liquid', matrix)

  const base = await get(themeId, 'assets/base.css')
  await put(themeId, 'assets/base.css', patchBaseCss(base))

  try {
    const index = await get(themeId, 'templates/index.json')
    const patched = patchIndex(index)
    if (patched !== index) {
      fs.writeFileSync(`scripts/tmp-index-price-fix-${themeId}.json`, patched)
      await put(themeId, 'templates/index.json', patched)
    } else {
      console.log('index unchanged', themeId)
    }
  } catch (e) {
    console.warn('index patch skip', themeId, e.message)
  }

  try {
    const livePlan = await get(themeId, 'blocks/ai_gen_block_361650c.liquid')
    const patchedPlan = patchLivePlanBlock(livePlan)
    // Prefer local if it already has ₹ formatting
    const toUpload = planBlockLocal.includes('₹{{ plan_price }}')
      ? planBlockLocal
      : patchedPlan
    if (!toUpload.includes('₹{{ plan_price }}')) {
      throw new Error('plan block still missing ₹ price format')
    }
    await put(themeId, 'blocks/ai_gen_block_361650c.liquid', toUpload)
  } catch (e) {
    console.warn('plan block patch', themeId, e.message)
  }
}

console.log('deployed price-card fixes')
