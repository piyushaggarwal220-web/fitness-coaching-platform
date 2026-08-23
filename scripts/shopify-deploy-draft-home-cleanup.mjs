/**
 * Draft-only homepage cleanup on:
 *   Copy of Copy of Copy of Offer live 2026-08-05 1... (161454620923)
 *
 * Home flow:
 *   Hero → What you get → Find-plan CTA → Plan cards →
 *   How-it-works + Compare CTAs → Transformations → social/FAQ
 *
 * Removes vs-others table, inline plan matrix, league block, how-it-works from home.
 * Creates /pages/how-lurvox-works and /pages/compare-plans.
 * Does NOT publish.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const THEME_ID = Number(process.argv[2] || 161454620923)
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const GQL = `${API}/graphql.json`

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${method} ${urlPath}: ${res.status} ${text.slice(0, 700)}`)
  return json
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function putAsset(key, value) {
  await api('PUT', `/themes/${THEME_ID}/assets.json`, { asset: { key, value } })
  console.log('uploaded', key)
}

async function getAsset(key) {
  const data = await api(
    'GET',
    `/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`
  )
  return data.asset?.value ?? ''
}

function readLocal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function buildCompareSection() {
  const rows = [
    ['Personal workout plan', true, true, true],
    ['Personal diet plan', true, true, true],
    ['Daily habit & health trackers', true, true, true],
    ['Coach chat support', true, true, true],
    ['Mid-week + weekly check-ins', true, true, true],
    ['Progress photos & journey', true, true, true],
    ['Weekly plan updates', false, true, true],
    ['Deep plateau-fix coaching', false, true, true],
    ['Lowest monthly rate', false, false, true],
    ['Priority check-ins', false, false, true],
  ]
  const blocks = {}
  const block_order = []
  rows.forEach(([feature, plan_3, plan_6, plan_12], i) => {
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
      headline: 'Pick with the full picture',
      subheadline:
        'Same full coaching on every plan. Longer plans cost less per month and unlock more support.',
      col_1_label: '3 MONTHS',
      col_1_price: '₹999',
      col_1_link: 'https://app.lurvox.in/checkout?plan=3_months&code=WELCOME60',
      col_2_label: '6 MONTHS',
      col_2_price: '₹1,699',
      col_2_link: 'https://app.lurvox.in/checkout?plan=6_months&code=WELCOME60',
      col_3_label: '12 MONTHS',
      col_3_price: '₹2,999',
      col_3_link: 'https://app.lurvox.in/checkout?plan=12_months&code=WELCOME60',
      find_url: '/pages/find-your-plan',
      home_url: '/#plans',
    },
  }
}

async function ensurePage(handle, title, templateSuffix) {
  const listed = await gql(
    `{
      pages(first: 50, query: "handle:${handle}") {
        nodes { id handle title templateSuffix isPublished }
      }
    }`
  )
  let page = listed.pages.nodes.find((p) => p.handle === handle) || null
  if (!page) {
    const created = await gql(
      `mutation pageCreate($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { id handle templateSuffix isPublished title }
          userErrors { field message }
        }
      }`,
      {
        page: {
          title,
          handle,
          templateSuffix,
          isPublished: true,
          body: '',
        },
      }
    )
    if (created.pageCreate.userErrors?.length) {
      throw new Error(JSON.stringify(created.pageCreate.userErrors))
    }
    page = created.pageCreate.page
    console.log('created page', handle)
  } else {
    const updated = await gql(
      `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id handle templateSuffix isPublished title }
          userErrors { field message }
        }
      }`,
      {
        id: page.id,
        page: { templateSuffix, isPublished: true, title },
      }
    )
    if (updated.pageUpdate.userErrors?.length) {
      throw new Error(JSON.stringify(updated.pageUpdate.userErrors))
    }
    page = updated.pageUpdate.page
    console.log('updated page', handle)
  }
  return page
}

const themes = await api('GET', '/themes.json')
const theme = (themes.themes || []).find((t) => t.id === THEME_ID)
if (!theme) throw new Error(`Theme ${THEME_ID} not found`)
if (theme.role === 'main') throw new Error('REFUSING: target is MAIN / live')
console.log('draft target', { id: theme.id, name: theme.name, role: theme.role })

await putAsset(
  'snippets/lurvox-what-you-get.liquid',
  readLocal('scripts/shopify-assets/snippets-lurvox-what-you-get.liquid')
)
await putAsset(
  'snippets/lurvox-home-flow.liquid',
  readLocal('scripts/shopify-assets/snippets-lurvox-home-flow.liquid')
)
await putAsset(
  'sections/lurvox-how-it-works.liquid',
  readLocal('scripts/shopify-assets/sections-lurvox-how-it-works.liquid')
)
await putAsset(
  'sections/lurvox-plan-compare.liquid',
  readLocal('scripts/shopify-assets/sections-lurvox-plan-compare.liquid')
)
await putAsset(
  'templates/page.how-lurvox-works.json',
  readLocal('scripts/shopify-assets/templates-page.how-lurvox-works.json')
)

const compareTemplate = {
  sections: {
    main: buildCompareSection(),
  },
  order: ['main'],
}
await putAsset('templates/page.compare-plans.json', `${JSON.stringify(compareTemplate, null, 2)}\n`)

await ensurePage('how-lurvox-works', 'How LURVOX works', 'how-lurvox-works')
await ensurePage('compare-plans', 'Compare plans', 'compare-plans')

const index = JSON.parse(await getAsset('templates/index.json'))
const section = index.sections?.home_blocks_v2
if (!section?.blocks) throw new Error('home_blocks_v2 missing on draft')

section.blocks.lurvox_what_you_get = {
  type: 'custom-liquid',
  settings: { custom_liquid: "{% render 'lurvox-what-you-get' %}" },
  blocks: {},
}
section.blocks.lurvox_home_find_cta = {
  type: 'custom-liquid',
  settings: { custom_liquid: "{% render 'lurvox-home-flow', mode: 'find' %}" },
  blocks: {},
}
section.blocks.lurvox_plans_anchor = {
  type: 'custom-liquid',
  settings: { custom_liquid: '<div id="plans"></div>' },
  blocks: {},
}
section.blocks.lurvox_home_after_plans = {
  type: 'custom-liquid',
  settings: { custom_liquid: "{% render 'lurvox-home-flow', mode: 'after_plans' %}" },
  blocks: {},
}

const KEEP = new Set([
  'ai_gen_block_52353f6_MmHVRV', // hero
  'lurvox_what_you_get',
  'lurvox_home_find_cta',
  'lurvox_plans_anchor',
  'ai_gen_block_361650c_qqYKXh', // plan cards
  'lurvox_home_after_plans',
  'ai_gen_block_cd3c949_6mqWVi', // transformations
  'ai_gen_block_a7d1b3c_hM7X88', // real people
  'ai_gen_block_19d52f6_xE8YAx', // talk to coach
  'contact_form_ArpxEr',
  'ai_gen_block_66d8696_yVRepa', // FAQ
  'lurvox_sales_closer',
  'lurvox_hide_1month_cl',
])

section.block_order = [
  'ai_gen_block_52353f6_MmHVRV',
  'lurvox_what_you_get',
  'lurvox_home_find_cta',
  'lurvox_plans_anchor',
  'ai_gen_block_361650c_qqYKXh',
  'lurvox_home_after_plans',
  'ai_gen_block_cd3c949_6mqWVi',
  'ai_gen_block_a7d1b3c_hM7X88',
  'ai_gen_block_19d52f6_xE8YAx',
  'contact_form_ArpxEr',
  'ai_gen_block_66d8696_yVRepa',
  'lurvox_sales_closer',
  'lurvox_hide_1month_cl',
]

// Disable removed blocks so theme editor stays tidy
for (const [id, block] of Object.entries(section.blocks)) {
  if (!KEEP.has(id)) {
    block.disabled = true
  } else {
    delete block.disabled
  }
}

await putAsset('templates/index.json', `${JSON.stringify(index, null, 2)}\n`)

console.log('home order', section.block_order)
console.log(
  'preview home',
  `https://www.lurvox.in/?preview_theme_id=${THEME_ID}`
)
console.log(
  'preview how',
  `https://www.lurvox.in/pages/how-lurvox-works?preview_theme_id=${THEME_ID}`
)
console.log(
  'preview compare',
  `https://www.lurvox.in/pages/compare-plans?preview_theme_id=${THEME_ID}`
)
