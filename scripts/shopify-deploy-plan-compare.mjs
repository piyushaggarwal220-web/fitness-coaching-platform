/**
 * Deploy plan comparison section to live theme, between plans and client-results.
 * Also embeds as a block inside home_blocks_v2 when possible.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const SECTION_KEY = 'sections/lurvox-plan-compare.liquid'
const SECTION_SRC = fs.readFileSync(
  path.join(process.cwd(), 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'),
  'utf8'
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

function buildSectionInstance() {
  const blocks = {}
  const block_order = []
  ROW_DEFS.forEach(([feature, plan_3, plan_6, plan_12], i) => {
    const id = `row_${i + 1}`
    blocks[id] = {
      type: 'row',
      settings: { feature, plan_3, plan_6, plan_12 },
    }
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

async function get(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} ${res.status}`)
  return (await res.json()).asset
}

async function put(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`PUT ${key} ${JSON.stringify(json.errors || json).slice(0, 300)}`)
  return json.asset
}

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('theme', main.id, main.name)

await put(main.id, SECTION_KEY, SECTION_SRC)
const readback = await get(main.id, SECTION_KEY)
console.log('section uploaded', !!readback?.value?.includes('lx-plan-compare'), readback?.value?.length)

const indexAsset = await get(main.id, 'templates/index.json')
const index = JSON.parse(indexAsset.value)

// Prefer top-level section after home_blocks_v2 content via inserting into home_blocks?
// Use template-level section between home_blocks_v2 pieces by adding to sections + order
// AFTER the main home blocks section is hard; instead insert into home_blocks_v2 as custom-liquid
// AND also add as sibling section in order after home_blocks_v2.

const sectionId = 'lurvox_plan_compare'
index.sections = index.sections || {}
index.order = index.order || Object.keys(index.sections)
index.sections[sectionId] = buildSectionInstance()

const homeIdx = index.order.indexOf('home_blocks_v2')
if (homeIdx >= 0) {
  index.order = index.order.filter((id) => id !== sectionId)
  index.order.splice(homeIdx + 1, 0, sectionId)
} else if (!index.order.includes(sectionId)) {
  index.order.push(sectionId)
}

const home = index.sections.home_blocks_v2
if (home?.blocks) {
  home.block_order = home.block_order || Object.keys(home.blocks)
  const bid = 'lurvox_plan_compare_cl'
  delete home.blocks[bid]
  home.block_order = home.block_order.filter((id) => id !== bid)
  console.log('removed legacy inline comparison fallback')
}

await put(main.id, 'templates/index.json', JSON.stringify(index, null, 2))
const verify = JSON.parse((await get(main.id, 'templates/index.json')).value)
console.log('index has section', !!verify.sections?.[sectionId], 'order', verify.order)
console.log(
  'legacy inline compare removed',
  !verify.sections?.home_blocks_v2?.blocks?.lurvox_plan_compare_cl
)

// Verify via section rendering + view=
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 2500))
  const sec = await fetch(
    `https://www.lurvox.in/?sections=lurvox-plan-compare&cb=${Date.now()}-${i}`
  ).then((r) => r.json())
  const view = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  console.log(i, {
    sectionApi: (sec['lurvox-plan-compare'] || '').includes('Crazy League'),
    viewHasTable: view.includes('lx-plan-compare') || view.includes('compare-plans'),
    viewHasPrize: view.includes('₹5,000') || view.includes('5,000 prize'),
  })
  if (
    (sec['lurvox-plan-compare'] || '').includes('Crazy League') &&
    (view.includes('lx-plan-compare') || view.includes('Crazy League +'))
  ) {
    console.log('COMPARE TABLE LIVE (fresh theme)')
    break
  }
}
