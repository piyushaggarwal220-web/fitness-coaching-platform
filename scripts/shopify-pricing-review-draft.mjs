/**
 * Keep the requested price theme live, duplicate it, and apply reviewed
 * pricing/table changes only to the unpublished copy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE = '9uwyq1-0j.myshopify.com'
const SITE = 'https://www.lurvox.in'
const API_VERSION = '2025-01'
const GQL = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`
const REST = `https://${STORE}/admin/api/${API_VERSION}`
const TARGET_NAME = 'LURVOX Prices 2026-07-29 09:29'
const REVIEW_NAME = 'LURVOX Price Review 1499-2499-3999 2026-07-29'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}
const compareLiquid = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-plan-compare.liquid'),
  'utf8'
)
const compareSnippet = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-plan-compare-inline.liquid'),
  'utf8'
)

const PLAN_PRICES = {
  3: {
    price: '1499',
    original: '1997',
    savings: 'SAVE ₹498',
    monthly: '≈ ₹500/month',
  },
  6: {
    price: '2499',
    original: '3794',
    savings: 'SAVE ₹1,295',
    monthly: '≈ ₹417/month',
  },
  12: {
    price: '3999',
    original: '6988',
    savings: 'SAVE ₹2,989',
    monthly: '≈ ₹333/month',
  },
}

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
  ['Priority check-ins', false, false, true],
  ['Quarterly 1:1 transformation strategy call', false, false, true],
]

async function gql(query, variables = {}) {
  const response = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

function numericThemeId(gid) {
  const match = String(gid).match(/OnlineStoreTheme\/(\d+)/)
  if (!match) throw new Error(`Could not parse theme ID: ${gid}`)
  return match[1]
}

async function getAsset(themeId, key) {
  const response = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!response.ok) throw new Error(`GET ${key}: ${response.status}`)
  return (await response.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const response = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(`PUT ${key}: ${JSON.stringify(json.errors || json).slice(0, 500)}`)
  }
}

async function listAssets(themeId) {
  const response = await fetch(`${REST}/themes/${themeId}/assets.json`, { headers })
  if (!response.ok) throw new Error(`LIST assets: ${response.status}`)
  return (await response.json()).assets ?? []
}

function durationForSlot(settings, slot) {
  const duration = String(settings[`plan_${slot}_duration`] ?? '').toLowerCase()
  if (/\b12\b/.test(duration)) return 12
  if (/\b6\b/.test(duration)) return 6
  if (/\b3\b/.test(duration)) return 3
  if (slot === 2) return 3
  if (slot === 3) return 6
  if (slot === 4) return 12
  return null
}

function patchSettings(settings) {
  let changes = 0

  for (let slot = 1; slot <= 4; slot += 1) {
    const priceKey = `plan_${slot}_price`
    if (!(priceKey in settings)) continue
    const duration = durationForSlot(settings, slot)
    const next = PLAN_PRICES[duration]
    if (!next) continue

    settings[priceKey] = next.price
    for (const suffix of ['original_price', 'original']) {
      const key = `plan_${slot}_${suffix}`
      if (key in settings) settings[key] = next.original
    }
    const savingsKey = `plan_${slot}_savings`
    if (savingsKey in settings) settings[savingsKey] = next.savings
    const monthlyKey = `plan_${slot}_monthly`
    if (monthlyKey in settings) settings[monthlyKey] = next.monthly
    changes += 1
  }

  if ('col_1_price' in settings) {
    settings.col_1_price = '₹1,499'
    settings.col_2_price = '₹2,499'
    settings.col_3_price = '₹3,999'
    changes += 3
  }

  return changes
}

function patchTree(value) {
  if (!value || typeof value !== 'object') return 0
  let changes = patchSettings(value)
  for (const child of Object.values(value)) changes += patchTree(child)
  return changes
}

function buildCompareSection() {
  const blocks = {}
  const blockOrder = []
  ROW_DEFS.forEach(([feature, plan_3, plan_6, plan_12], index) => {
    const id = `row_${index + 1}`
    blocks[id] = {
      type: 'row',
      settings: { feature, plan_3, plan_6, plan_12 },
    }
    blockOrder.push(id)
  })
  return {
    type: 'lurvox-plan-compare',
    blocks,
    block_order: blockOrder,
    settings: {
      eyebrow: 'Compare plans',
      headline: 'Choose the right plan for your needs',
      subheadline: 'Longer plans unlock more support, league rewards, and prize money.',
      col_1_label: '3 MONTHS',
      col_1_price: '₹1,499',
      col_1_link: 'https://app.lurvox.in/plans/3-months',
      col_2_label: '6 MONTHS',
      col_2_price: '₹2,499',
      col_2_link: 'https://app.lurvox.in/plans/6-months',
      col_3_label: '12 MONTHS',
      col_3_price: '₹3,999',
      col_3_link: 'https://app.lurvox.in/plans/12-months',
    },
  }
}

function placeComparisonUnderPlans(index) {
  index.sections ??= {}
  index.order ??= Object.keys(index.sections)
  delete index.sections.lurvox_plan_compare
  index.order = index.order.filter((id) => id !== 'lurvox_plan_compare')

  let target = null
  let planBlockId = null
  for (const section of Object.values(index.sections)) {
    if (!section?.blocks) continue
    for (const [blockId, block] of Object.entries(section.blocks)) {
      const source = JSON.stringify(block ?? {})
      if (
        source.includes('lx-plan-compare') ||
        source.includes('lurvox-plan-compare-inline')
      ) {
        delete section.blocks[blockId]
        section.block_order = (section.block_order ?? []).filter((id) => id !== blockId)
        continue
      }
      if (
        !planBlockId &&
        (source.includes('361650c') || source.includes('plan_2_price'))
      ) {
        target = section
        planBlockId = blockId
      }
    }
  }

  if (!target || !planBlockId) {
    throw new Error('Could not locate homepage plan block for comparison placement')
  }

  const inlineId = 'lurvox_plan_compare_inline'
  target.blocks[inlineId] = {
    type: 'custom-liquid',
    settings: {
      custom_liquid: "{% render 'lurvox-plan-compare-inline' %}",
    },
  }
  target.block_order ??= Object.keys(target.blocks)
  target.block_order = target.block_order.filter((id) => id !== inlineId)
  const planIndex = target.block_order.indexOf(planBlockId)
  target.block_order.splice(planIndex + 1, 0, inlineId)
  return { inlineId, planBlockId, target }
}

function removeWhatMattersBlock(index) {
  let removed = 0
  for (const section of Object.values(index.sections ?? {})) {
    if (!section?.blocks) continue
    for (const [blockId, block] of Object.entries(section.blocks)) {
      const source = JSON.stringify(block?.settings ?? {})
      if (
        !source.includes('What you actually get.') &&
        !source.includes('consistency pays you back')
      ) {
        continue
      }
      delete section.blocks[blockId]
      section.block_order = (section.block_order ?? []).filter((id) => id !== blockId)
      removed += 1
    }
  }
  return removed
}

const initialThemes = (await gql(`{ themes(first: 50) { nodes { id name role } } }`)).themes.nodes
const requestedTheme = initialThemes.find((theme) => theme.name === TARGET_NAME)
if (!requestedTheme) throw new Error(`Theme not found: ${TARGET_NAME}`)

if (requestedTheme.role !== 'MAIN') {
  const publish = await gql(
    `mutation PublishTheme($id: ID!) {
      themePublish(id: $id) {
        theme { id name role }
        userErrors { field message }
      }
    }`,
    { id: requestedTheme.id }
  )
  if (publish.themePublish.userErrors?.length) {
    throw new Error(JSON.stringify(publish.themePublish.userErrors, null, 2))
  }
}

const afterPublish = (await gql(`{ themes(first: 50) { nodes { id name role } } }`)).themes.nodes
const active = afterPublish.find((theme) => theme.role === 'MAIN')
if (active?.id !== requestedTheme.id) {
  throw new Error(`Requested theme is not MAIN. Current MAIN: ${active?.name ?? 'unknown'}`)
}
console.log('MAIN kept active:', active.name, active.id)

let reviewTheme = afterPublish.find(
  (theme) => theme.name === REVIEW_NAME && theme.role !== 'MAIN'
)
if (!reviewTheme) {
  const duplicate = await gql(
    `mutation DuplicateTheme($id: ID!, $name: String) {
      themeDuplicate(id: $id, name: $name) {
        newTheme { id name role }
        userErrors { field message }
      }
    }`,
    { id: requestedTheme.id, name: REVIEW_NAME }
  )
  if (duplicate.themeDuplicate.userErrors?.length) {
    throw new Error(JSON.stringify(duplicate.themeDuplicate.userErrors, null, 2))
  }
  reviewTheme = duplicate.themeDuplicate.newTheme
}
if (!reviewTheme?.id || reviewTheme.role === 'MAIN') {
  throw new Error('Safe draft duplication failed')
}
const reviewId = numericThemeId(reviewTheme.id)
console.log('Review copy ready:', reviewTheme.name, reviewTheme.id)

let indexReady = false
for (let attempt = 1; attempt <= 20; attempt += 1) {
  try {
    const indexValue = await getAsset(reviewId, 'templates/index.json')
    if (indexValue) {
      indexReady = true
      break
    }
  } catch {
    // Shopify theme duplication copies files asynchronously.
  }
  await new Promise((resolve) => setTimeout(resolve, 3000))
}
if (!indexReady) throw new Error('Review copy did not finish copying within 60 seconds')

await putAsset(reviewId, 'sections/lurvox-plan-compare.liquid', compareLiquid)
await putAsset(reviewId, 'snippets/lurvox-plan-compare-inline.liquid', compareSnippet)

const assets = await listAssets(reviewId)
const jsonKeys = assets
  .map((asset) => asset.key)
  .filter(
    (key) =>
      (key.startsWith('templates/') || key.startsWith('sections/')) &&
      key.endsWith('.json')
  )

let totalPriceChanges = 0
const changedAssets = []
for (const key of jsonKeys) {
  const value = await getAsset(reviewId, key)
  if (!value || (!value.includes('plan_') && !value.includes('col_1_price'))) continue
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    continue
  }
  const changes = patchTree(parsed)
  if (key === 'templates/index.json') {
    placeComparisonUnderPlans(parsed)
    removeWhatMattersBlock(parsed)
  }
  if (!changes && key !== 'templates/index.json') continue
  await putAsset(reviewId, key, JSON.stringify(parsed, null, 2))
  totalPriceChanges += changes
  changedAssets.push(key)
}

const verifyIndex = JSON.parse(await getAsset(reviewId, 'templates/index.json'))
const verifyCompare = await getAsset(reviewId, 'snippets/lurvox-plan-compare-inline.liquid')
const whatMattersRemoved = !JSON.stringify(verifyIndex).includes(
  'consistency pays you back'
)
let inlineVerification = null
for (const section of Object.values(verifyIndex.sections ?? {})) {
  const block = section?.blocks?.lurvox_plan_compare_inline
  if (!block) continue
  const order = section.block_order ?? []
  const inlineIndex = order.indexOf('lurvox_plan_compare_inline')
  const previousId = order[inlineIndex - 1]
  inlineVerification = {
    exists: true,
    previousBlockIsPlans: JSON.stringify(section.blocks?.[previousId] ?? {}).includes('plan_2_price'),
  }
  break
}
const previewUrl = `${SITE}/?preview_theme_id=${reviewId}`
const result = {
  ok: true,
  activeMain: { id: active.id, name: active.name },
  reviewTheme: { id: reviewTheme.id, numericId: reviewId, name: reviewTheme.name, role: reviewTheme.role },
  previewUrl,
  priceChanges: totalPriceChanges,
  changedAssets,
  comparison: {
    inHomepage: Boolean(inlineVerification?.exists),
    directlyAfterPlans: Boolean(inlineVerification?.previousBlockIsPlans),
    mobileFixed:
      verifyCompare.includes('table-layout: fixed') &&
      verifyCompare.includes('@media (max-width: 640px)'),
    prices: ['₹1,499', '₹2,499', '₹3,999'],
  },
  whatMattersRemoved,
}

fs.writeFileSync(
  path.join(__dirname, 'tmp-pricing-review-draft.json'),
  JSON.stringify(result, null, 2)
)
console.log(JSON.stringify(result, null, 2))
