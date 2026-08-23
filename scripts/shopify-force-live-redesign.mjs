/**
 * Force-apply redesign assets + new prices onto current MAIN theme.
 * Auth: node scripts/shopify-pkce-auth.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `https://${STORE}/admin/api/2025-01/graphql.json`
const SITE = 'https://www.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

const homeLiquid = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-home-redesign.liquid'),
  'utf8'
)
const headerLiquid = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-header-redesign.liquid'),
  'utf8'
)
const compareLiquid = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-plan-compare.liquid'),
  'utf8'
)
const headerGroup = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-header-group.header-redesign.json'),
  'utf8'
)
const homeIndex = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'shopify-assets', 'templates-index.home-redesign.json'),
    'utf8'
  )
)

const ROW_DEFS = [
  ['Personal workout plan', true, true, true],
  ['Personal diet plan', true, true, true],
  ['Daily habit & health trackers', true, true, true],
  ['Coach chat support', true, true, true],
  ['Weekly coach check-ins', true, true, true],
  ['Progress photos & journey', true, true, true],
  ['Weekly plan updates', false, true, true],
  ['Consistency League entry', false, true, true],
  ['Certificates & physical trophies', false, true, true],
  ['Deep plateau-fix coaching', false, true, true],
  ['Lowest monthly rate', false, false, true],
  ['Crazy League + ₹5,000 prize money', false, false, true],
]

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

function themeNumericId(gid) {
  const m = String(gid).match(/OnlineStoreTheme\/(\d+)/)
  if (!m) throw new Error(`Bad theme gid: ${gid}`)
  return m[1]
}

async function restGet(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} ${res.status}`)
  return (await res.json()).asset?.value ?? ''
}

async function restPut(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(`PUT ${key} ${JSON.stringify(json.errors || json).slice(0, 400)}`)
  }
}

function buildCompareSection() {
  const blocks = {}
  const block_order = []
  ROW_DEFS.forEach(([feature, plan_3, plan_6, plan_12], i) => {
    const id = `row_${i + 1}`
    blocks[id] = { type: 'row', settings: { feature, plan_3, plan_6, plan_12 } }
    block_order.push(id)
  })
  return {
    type: 'lurvox-plan-compare',
    blocks,
    block_order,
    settings: {
      eyebrow: 'Compare plans',
      headline: 'Choose the right plan for your needs',
      subheadline: 'Longer plans unlock more support, league rewards, and prize money.',
      col_1_label: '3 MONTHS',
      col_1_price: '₹999',
      col_1_link: 'https://app.lurvox.in/plans/3-months',
      col_2_label: '6 MONTHS',
      col_2_price: '₹1,699',
      col_2_link: 'https://app.lurvox.in/plans/6-months',
      col_3_label: '12 MONTHS',
      col_3_price: '₹2,999',
      col_3_link: 'https://app.lurvox.in/plans/12-months',
    },
  }
}

function patchLegacyIndex(index) {
  let patched = 0
  for (const section of Object.values(index.sections || {})) {
    for (const [key, block] of Object.entries(section.blocks || {})) {
      const isPlan =
        block?.type === 'ai_gen_block_361650c' ||
        key.includes('361650c') ||
        block?.settings?.plan_1_price != null
      if (!isPlan || !block.settings) continue
      const s = block.settings
      s.plan_1_enabled = false
      s.plan_1_duration = 'ZZ_GONE'
      s.plan_1_price = '999'
      s.plan_1_link = 'https://app.lurvox.in/plans/3-months'
      s.plan_2_enabled = true
      s.plan_2_duration = '3 Months'
      s.plan_2_price = '999'
      s.plan_2_original_price = '1497'
      s.plan_2_savings = 'SAVE ₹498'
      s.plan_2_monthly = '≈ ₹333/month'
      s.plan_2_link = 'https://app.lurvox.in/plans/3-months'
      s.plan_3_enabled = true
      s.plan_3_duration = '6 Months'
      s.plan_3_price = '1699'
      s.plan_3_original_price = '2994'
      s.plan_3_savings = 'SAVE ₹1,295'
      s.plan_3_monthly = '≈ ₹283/month'
      s.plan_3_link = 'https://app.lurvox.in/plans/6-months'
      s.plan_3_default = true
      s.plan_4_enabled = true
      s.plan_4_duration = '12 Months'
      s.plan_4_price = '2999'
      s.plan_4_original_price = '5988'
      s.plan_4_savings = 'SAVE ₹2,989'
      s.plan_4_monthly = '≈ ₹250/month'
      s.plan_4_link = 'https://app.lurvox.in/plans/12-months'
      patched += 1
    }
  }
  index.sections = index.sections || {}
  index.order = index.order || Object.keys(index.sections)
  index.sections.lurvox_plan_compare = buildCompareSection()
  index.order = index.order.filter((id) => id !== 'lurvox_plan_compare')
  const homeIdx = index.order.findIndex((id) => id.includes('home') || id.includes('blocks'))
  if (homeIdx >= 0) index.order.splice(homeIdx + 1, 0, 'lurvox_plan_compare')
  else index.order.push('lurvox_plan_compare')
  return patched
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN theme')
const numericId = themeNumericId(main.id)
console.log('MAIN', main.name, main.id, numericId)

await restPut(numericId, 'sections/lurvox-home-redesign.liquid', homeLiquid)
await restPut(numericId, 'sections/lurvox-header-redesign.liquid', headerLiquid)
await restPut(numericId, 'sections/lurvox-plan-compare.liquid', compareLiquid)
await restPut(numericId, 'sections/header-group.json', headerGroup)

const redesignIndex = { ...homeIndex }
redesignIndex.sections = { ...homeIndex.sections, lurvox_plan_compare: buildCompareSection() }
redesignIndex.order = ['lx_home_redesign', 'lurvox_plan_compare']
await restPut(numericId, 'templates/index.json', JSON.stringify(redesignIndex, null, 2))

const verifyIndex = JSON.parse(await restGet(numericId, 'templates/index.json'))
const headerVerify = await restGet(numericId, 'sections/header-group.json')
console.log({
  indexOrder: verifyIndex.order,
  hasHome: !!verifyIndex.sections?.lx_home_redesign,
  hasCompare: !!verifyIndex.sections?.lurvox_plan_compare,
  plan1Enabled: verifyIndex.sections?.lx_home_redesign?.settings?.plan_1_enabled,
  planPrices: {
    p2: verifyIndex.sections?.lx_home_redesign?.settings?.plan_2_price,
    p3: verifyIndex.sections?.lx_home_redesign?.settings?.plan_3_price,
    p4: verifyIndex.sections?.lx_home_redesign?.settings?.plan_4_price,
  },
  headerRedesign: /lurvox-header-redesign/.test(headerVerify),
})

// Also patch any duplicate live index copies if Asset API reverts to legacy block structure.
if (!verifyIndex.sections?.lx_home_redesign) {
  const patched = patchLegacyIndex(verifyIndex)
  await restPut(numericId, 'templates/index.json', JSON.stringify(verifyIndex, null, 2))
  console.log('legacy index patched', patched)
}

for (let i = 1; i <= 8; i += 1) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await fetch(`${SITE}/?force=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  }).then((r) => r.text())
  let theme = null
  const m = html.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\});/)
  if (m) {
    try {
      theme = JSON.parse(m[1])
    } catch {
      theme = null
    }
  }
  const checks = {
    i,
    themeId: theme?.id ?? null,
    themeName: theme?.name ?? null,
    header: html.includes('data-lx-hdr'),
    home: html.includes('data-lx-home'),
    compare: html.includes('lx-plan-compare'),
    price999: html.includes('999'),
    price1699: html.includes('1699'),
    price2999: html.includes('2999'),
    oneMonth: /1\s*month/i.test(html) && html.includes('499'),
  }
  console.log(checks)
  if (checks.header && checks.home && checks.compare && !checks.oneMonth) {
    console.log('LIVE REDESIGN CONVERGED')
    process.exit(0)
  }
}

console.log(
  'Assets written to MAIN. Storefront HTML may still be CDN-stale — toggle Online Store password to flush.'
)
console.log('Preview:', `${SITE}/?preview_theme_id=${numericId}`)
