/**
 * Deploy offer-home section into index (bypasses sticky header-group page_cache).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const also = themes.themes.nodes.filter((t) =>
  ['161389281531', '161390362875', '161375289595'].includes(t.id.split('/').pop())
)
const targets = [main, ...also.filter((t) => t.id !== main.id)]
console.log(
  'targets',
  targets.map((t) => `${t.role}:${t.name}:${t.id.split('/').pop()}`)
)

const files = [
  {
    filename: 'sections/lurvox-offer-home.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__lurvox-offer-home.liquid'), 'utf8'),
    },
  },
  {
    filename: 'templates/index.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'templates__index.json'), 'utf8'),
    },
  },
  {
    filename: 'blocks/ai_gen_block_361650c.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'blocks__ai_gen_block_361650c.liquid'), 'utf8'),
    },
  },
  {
    filename: 'snippets/header-drawer.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'snippets__header-drawer.liquid'), 'utf8'),
    },
  },
  {
    filename: 'sections/header-group.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__header-group.json'), 'utf8'),
    },
  },
]

for (const theme of targets) {
  console.log('upsert', theme.id.split('/').pop())
  // For New changes, skip index if tap-force missing — upload section+block first without index
  const payload =
    theme.id.includes('161375289595')
      ? files.filter((f) => f.filename !== 'templates/index.json')
      : files
  const upsert = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: theme.id, files: payload }
  )
  console.log(
    '  ok',
    upsert.themeFilesUpsert?.upsertedThemeFiles?.map((f) => f.filename)
  )
  if (upsert.themeFilesUpsert?.userErrors?.length) {
    console.log('  err', JSON.stringify(upsert.themeFilesUpsert.userErrors))
  }
}

await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: main.id }
)
console.log('published', main.id.split('/').pop())

function probe(html) {
  return {
    shopifyTheme: html.match(/"id":(\d+),"schema_name"/)?.[1],
    offerHome: html.includes('lurvox-offer-strip-home') || html.includes('lurvox-offer-home'),
    save5: html.includes('SAVE5'),
    saleEnds: /SALE ENDS IN/i.test(html),
    priceIncreases: html.includes('Price increases in'),
    hideOldCss: html.includes('lurvox-offer-home-css'),
    oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
  }
}

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  for (const label of ['index', 'root']) {
    const u =
      label === 'index'
        ? `https://www.lurvox.in/index?cb=${Date.now()}`
        : `https://www.lurvox.in/?cb=${Date.now()}`
    const html = await (
      await fetch(u, {
        headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' },
      })
    ).text()
    const p = probe(html)
    console.log(i, label, p)
    if (p.offerHome && p.save5 && p.priceIncreases) {
      console.log('SUCCESS — offer home section live in HTML')
      process.exit(0)
    }
  }
}
process.exit(1)
