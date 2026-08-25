/**
 * Push Fat loss / Fat loss + muscle gain / Aesthetic body copy to the live theme.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME = 161454620923
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const tokenPath = path.join(process.env.TEMP || '', 'shopify-auth-token.json')
const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) {
    console.error(JSON.stringify(json, null, 2))
    process.exit(1)
  }
  return json.data
}

function file(rel, dest) {
  return {
    filename: dest,
    body: { type: 'TEXT', value: fs.readFileSync(path.join(ROOT, rel), 'utf8') },
  }
}

function patchThemeSettings(obj) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (const item of obj) patchThemeSettings(item)
    return
  }

  const labels = {
    plan_2_label: 'Fat loss',
    plan_3_label: 'Fat loss + muscle gain',
    plan_4_label: 'Aesthetic body',
    plan_2_badge: 'FAT LOSS',
    plan_3_badge: 'MUSCLE GAIN',
    plan_4_badge: 'AESTHETIC',
    plan_2_description: 'Fat loss',
    plan_3_description: 'Fat loss + muscle gain',
    plan_4_description: 'Aesthetic body',
    plan_2_footer: 'Best for: looking sharp for an event, not long term',
    plan_3_footer: 'Best for: advanced athletes who want little refinement',
    plan_4_footer: 'Best for: complete aesthetic transformation',
    subheadline:
      'Fat loss · 90 days. Fat loss + muscle gain · 6 months. Aesthetic body · 12 months. WELCOME60 = 60% off',
  }
  for (const [key, value] of Object.entries(labels)) {
    if (typeof obj[key] === 'string') obj[key] = value
  }

  if (typeof obj.col_1_label === 'string' && /reduce bloating|look sharper|debloat/i.test(obj.col_1_label)) {
    obj.col_1_label = 'Fat loss'
  }
  if (obj.col_2_label === 'Fat loss') obj.col_2_label = 'Fat loss + muscle gain'
  if (
    typeof obj.col_3_label === 'string' &&
    /fat loss \+ muscle/i.test(obj.col_3_label) &&
    !/gain/i.test(obj.col_3_label)
  ) {
    obj.col_3_label = 'Aesthetic body'
  }
  if (typeof obj.headline === 'string' && /reduce bloating|look sharper|fat loss \+ muscle in 12/i.test(obj.headline)) {
    obj.headline = 'Fat loss in 90 days. Fat loss + muscle gain in 6 months. Aesthetic body in 12.'
  }
  if (
    typeof obj.subheadline === 'string' &&
    /reduce bloating|look sharper|complete transformation|debloat/i.test(obj.subheadline)
  ) {
    obj.subheadline =
      'Fat loss · 90 days. Fat loss + muscle gain · 6 months. Aesthetic body · 12 months. WELCOME60 = 60% off'
  }
  if (typeof obj.plan_3_text === 'string' && obj.feature === 'Best for') {
    obj.plan_3_text = 'Looking sharp for an event, not long term'
  }
  if (typeof obj.plan_6_text === 'string' && obj.feature === 'Best for') {
    obj.plan_6_text = 'Advanced athletes who want little refinement'
  }
  if (typeof obj.plan_12_text === 'string' && obj.feature === 'Best for') {
    obj.plan_12_text = 'Complete aesthetic transformation'
  }

  for (const value of Object.values(obj)) patchThemeSettings(value)
}

function rewriteThemeJson(raw) {
  const brace = raw.indexOf('{')
  if (brace < 0) return { content: raw, changed: false }
  const prefix = raw.slice(0, brace)
  let parsed
  try {
    parsed = JSON.parse(raw.slice(brace))
  } catch {
    return { content: raw, changed: false }
  }
  const before = JSON.stringify(parsed)
  patchThemeSettings(parsed)
  const after = JSON.stringify(parsed)
  if (before === after) return { content: raw, changed: false }
  return { content: prefix + JSON.stringify(parsed, null, 2) + '\n', changed: true }
}

const liquidFiles = [
  file('scripts/shopify-assets/sections-lurvox-cart-builder.liquid', 'sections/lurvox-cart-builder.liquid'),
  file(
    'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid',
    'snippets/lurvox-plan-compare-inline.liquid'
  ),
  file('scripts/shopify-assets/sections-lurvox-ad-landing.liquid', 'sections/lurvox-ad-landing.liquid'),
  file('scripts/shopify-assets/sections-lurvox-plan-finder.liquid', 'sections/lurvox-plan-finder.liquid'),
  file('scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid', 'sections/lurvox-talk-to-coach.liquid'),
  file('scripts/shopify-assets/snippets-lurvox-sales-closer.liquid', 'snippets/lurvox-sales-closer.liquid'),
  file('scripts/shopify-assets/sections-lurvox-plan-compare.liquid', 'sections/lurvox-plan-compare.liquid'),
  file('scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid', 'blocks/ai_gen_block_361650c.liquid'),
]

const jsonFilenames = [
  'templates/index.json',
  'templates/page.compare-plans.json',
  'templates/page.json',
  'templates/page.league.json',
  'templates/page.consistency-league.json',
]

const fetched = await gql(
  `query themeJson($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 20) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  {
    id: `gid://shopify/OnlineStoreTheme/${THEME}`,
    filenames: jsonFilenames,
  }
)

const jsonUpserts = []
for (const node of fetched.theme.files.nodes) {
  if (!node.body?.content) continue
  const { content, changed } = rewriteThemeJson(node.body.content)
  if (changed) {
    jsonUpserts.push({ filename: node.filename, body: { type: 'TEXT', value: content } })
    console.log('patched json', node.filename)
  }
}

const files = [...liquidFiles, ...jsonUpserts]
const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
    files,
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  console.error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
  process.exit(1)
}
console.log(
  'upserted',
  upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', ')
)
