/**
 * Duplicate MAIN Shopify theme → unpublished draft, then replace homepage
 * with the Athletic Editorial redesign. NEVER writes to MAIN / never publishes.
 *
 * Auth: node scripts/shopify-pkce-auth.mjs
 * Run:  node scripts/shopify-home-redesign-draft.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const SITE = 'https://www.lurvox.in'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const draftMetaPath = path.join(process.env.TEMP, 'shopify-home-redesign-draft.json')

const sectionPath = path.join(__dirname, 'shopify-assets', 'sections-lurvox-home-redesign.liquid')
const indexPath = path.join(__dirname, 'shopify-assets', 'templates-index.home-redesign.json')
const headerPath = path.join(__dirname, 'shopify-assets', 'sections-lurvox-header-redesign.liquid')
const headerGroupPath = path.join(
  __dirname,
  'shopify-assets',
  'sections-header-group.header-redesign.json'
)
const comparisonPath = path.join(
  __dirname,
  'shopify-assets',
  'sections-lurvox-plan-compare.liquid'
)

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}
if (
  !fs.existsSync(sectionPath) ||
  !fs.existsSync(indexPath) ||
  !fs.existsSync(headerPath) ||
  !fs.existsSync(headerGroupPath) ||
  !fs.existsSync(comparisonPath)
) {
  console.error('Missing redesign assets under scripts/shopify-assets/')
  process.exit(1)
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const sectionLiquid = fs.readFileSync(sectionPath, 'utf8')
const headerLiquid = fs.readFileSync(headerPath, 'utf8')
const headerGroupJson = fs.readFileSync(headerGroupPath, 'utf8')
const comparisonLiquid = fs.readFileSync(comparisonPath, 'utf8')
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))

const comparisonRows = [
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
const comparisonBlocks = Object.fromEntries(
  comparisonRows.map(([feature, plan_3, plan_6, plan_12], index) => [
    `row_${index + 1}`,
    { type: 'row', settings: { feature, plan_3, plan_6, plan_12 } },
  ])
)
index.sections.lurvox_plan_compare = {
  type: 'lurvox-plan-compare',
  blocks: comparisonBlocks,
  block_order: Object.keys(comparisonBlocks),
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
index.order = ['lx_home_redesign', 'lurvox_plan_compare']
const indexJson = JSON.stringify(index, null, 2)
JSON.parse(headerGroupJson)

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

function themeNumericId(gid) {
  const m = String(gid).match(/OnlineStoreTheme\/(\d+)/)
  if (!m) throw new Error('Could not parse theme numeric id from ' + gid)
  return m[1]
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN theme found')

const draftName = `LURVOX Home Redesign ${new Date().toISOString().slice(0, 10)}`

// Prefer an existing Home Redesign draft from this run's meta; otherwise create fresh.
let draft = null
if (fs.existsSync(draftMetaPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(draftMetaPath, 'utf8'))
    const existing = themes.themes.nodes.find((t) => t.id === meta.draftThemeId)
    if (existing && existing.role !== 'MAIN') {
      draft = existing
      console.log('Reusing draft theme:', draft.name, draft.id)
    }
  } catch {
    // create below
  }
}

if (!draft) {
  const byName = themes.themes.nodes.find(
    (t) => t.role !== 'MAIN' && t.name?.startsWith('LURVOX Home Redesign')
  )
  if (byName) {
    draft = byName
    console.log('Reusing named draft theme:', draft.name, draft.id)
  }
}

if (!draft) {
  console.log('Duplicating MAIN theme →', draftName)
  const dup = await gql(
    `mutation themeDuplicate($id: ID!, $name: String) {
      themeDuplicate(id: $id, name: $name) {
        newTheme { id name role }
        userErrors { field message }
      }
    }`,
    { id: main.id, name: draftName }
  )
  if (dup.themeDuplicate.userErrors?.length) {
    throw new Error(JSON.stringify(dup.themeDuplicate.userErrors, null, 2))
  }
  draft = dup.themeDuplicate.newTheme
  console.log('Created draft theme:', draft.name, draft.id)
}

if (!draft?.id) throw new Error('Draft theme missing')
if (draft.id === main.id || draft.role === 'MAIN') {
  throw new Error('REFUSING to write: target theme is MAIN / live')
}

fs.writeFileSync(
  draftMetaPath,
  JSON.stringify(
    {
      draftThemeId: draft.id,
      draftThemeName: draft.name,
      mainThemeId: main.id,
      mainThemeName: main.name,
      createdAt: new Date().toISOString(),
      previewUrl: `${SITE}/?preview_theme_id=${themeNumericId(draft.id)}`,
    },
    null,
    2
  )
)

async function upsertFiles(files, label) {
  console.log(label)
  const upsert = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: draft.id, files }
  )
  if (upsert.themeFilesUpsert.userErrors?.length) {
    throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
  }
  return upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
}

// Section must exist before index.json can reference it.
const upsertedSection = await upsertFiles(
  [
    {
      filename: 'sections/lurvox-home-redesign.liquid',
      body: { type: 'TEXT', value: sectionLiquid },
    },
    {
      filename: 'sections/lurvox-header-redesign.liquid',
      body: { type: 'TEXT', value: headerLiquid },
    },
    {
      filename: 'sections/lurvox-plan-compare.liquid',
      body: { type: 'TEXT', value: comparisonLiquid },
    },
  ],
  'Uploading redesign sections to draft only…'
)
const upsertedIndex = await upsertFiles(
  [
    {
      filename: 'templates/index.json',
      body: { type: 'TEXT', value: indexJson },
    },
  ],
  'Uploading index template to draft only…'
)
const upserted = [...upsertedSection, ...upsertedIndex]

const numericId = themeNumericId(draft.id)
async function restPutAsset(key, value) {
  const rest = `https://${STORE}/admin/api/2025-01`
  const res = await fetch(`${rest}/themes/${numericId}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) {
    throw new Error(`REST PUT ${key} ${res.status} ${(await res.text()).slice(0, 400)}`)
  }
}
await restPutAsset('sections/header-group.json', headerGroupJson)
upserted.push('sections/header-group.json')

const previewUrl = `${SITE}/?preview_theme_id=${numericId}`

const result = {
  ok: true,
  published: false,
  wroteToMain: false,
  draftThemeId: draft.id,
  draftThemeName: draft.name,
  mainThemeId: main.id,
  mainThemeName: main.name,
  upserted,
  previewUrl,
  liveUrl: SITE + '/',
  note: 'Live MAIN was not modified. Preview includes the homepage, header, prices, and comparison table.',
}

fs.writeFileSync(
  path.join(__dirname, 'tmp-home-redesign-deploy.json'),
  JSON.stringify(result, null, 2)
)

console.log(JSON.stringify(result, null, 2))
