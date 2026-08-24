/**
 * Push Reduce bloating copy + related sections to the live theme.
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

function rewriteThemeJson(raw) {
  let content = raw
  const brace = content.indexOf('{')
  if (brace < 0) return { content, changed: false }
  const prefix = content.slice(0, brace)
  let json = content.slice(brace)
  const next = json
    .replaceAll('Look sharper', 'Reduce bloating')
    .replaceAll(
      'Look special for an event. No long-term effects. A 90-day tighter look — not real fat loss.',
      'Look special for an event. No long-term effects.'
    )
    .replaceAll(
      'Look sharper for a wedding, trip, or shoot. A 90-day tighter look — not real fat loss.',
      'Look special for an event. No long-term effects.'
    )
    .replaceAll('Best for: looking sharper for a date', 'Best for: looking special for an event. No long-term effects.')
    .replaceAll('looking sharper for a date', 'looking special for an event. No long-term effects.')
    .replaceAll(
      'Fat down and muscle up — the aesthetic body. Lowest ₹/month + weekly coach call.',
      'Best for an aesthetic body and a complete transformation.'
    )
    .replaceAll('Best for: fat loss + muscle', 'Best for: aesthetic body and complete transformation')
    .replaceAll(
      'Fat down and muscle up — the aesthetic body. Lowest ₹/month + weekly coach call.',
      'Best for an aesthetic body and a complete transformation.'
    )
    .replaceAll(
      'Beginners and intermediates who have plateaued, or want to start fresh.',
      'An aesthetic body and a complete transformation.'
    )
    .replaceAll(
      'Most people who want the finished look — leaner and more muscular.',
      'An aesthetic body and a complete transformation.'
    )
    .replaceAll(
      'Fat down and muscle up — the aesthetic body.',
      'Best for an aesthetic body and a complete transformation.'
    )
  return { content: prefix + next, changed: next !== json }
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
