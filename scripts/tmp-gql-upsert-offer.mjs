/**
 * Force offer strip + drawer login + plan timer via GraphQL themeFilesUpsert
 * (REST asset PUTs are not invalidating homepage page_cache).
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

async function getAsset(themeId, key) {
  const r = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  return (await r.json()).asset?.value || null
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const sticky = themes.themes.nodes.filter((t) =>
  ['161389281531', '161375289595', '161390362875'].includes(t.id.split('/').pop())
)
console.log('MAIN', main.name, main.id.split('/').pop())
const targets = [main, ...sticky.filter((t) => t.id !== main.id)]

const filesLocal = {
  'sections/lurvox-client-login.liquid': fs.readFileSync(
    path.join(DIR, 'sections__lurvox-client-login.liquid'),
    'utf8'
  ),
  'sections/header-group.json': fs.readFileSync(
    path.join(DIR, 'sections__header-group.json'),
    'utf8'
  ),
  'snippets/header-drawer.liquid': fs.readFileSync(
    path.join(DIR, 'snippets__header-drawer.liquid'),
    'utf8'
  ),
  'blocks/ai_gen_block_361650c.liquid': fs.readFileSync(
    path.join(DIR, 'blocks__ai_gen_block_361650c.liquid'),
    'utf8'
  ),
  'templates/index.json': fs.readFileSync(path.join(DIR, 'templates__index.json'), 'utf8'),
}

const stamp = Date.now()

for (const theme of targets) {
  const themeId = theme.id.split('/').pop()
  let layout = await getAsset(themeId, 'layout/theme.liquid')
  if (!layout) {
    console.log('skip missing layout', themeId)
    continue
  }
  layout = layout.replace(
    /<!-- lurvox-cache-bust \d+ -->/,
    `<!-- lurvox-cache-bust ${stamp} -->`
  )
  if (!layout.includes('lurvox-cache-bust')) {
    layout = layout.replace('</head>', `  <!-- lurvox-cache-bust ${stamp} -->\n</head>`)
  }

  const files = [
    ...Object.entries(filesLocal).map(([filename, value]) => ({
      filename,
      body: { type: 'TEXT', value },
    })),
    {
      filename: 'layout/theme.liquid',
      body: { type: 'TEXT', value: layout },
    },
  ]

  console.log('upserting', themeId, theme.name)
  const upsert = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: theme.id, files }
  )
  const errs = upsert.themeFilesUpsert?.userErrors || []
  const ok = upsert.themeFilesUpsert?.upsertedThemeFiles?.map((f) => f.filename)
  console.log('  files', ok)
  if (errs.length) console.log('  errors', JSON.stringify(errs))
}

// republish MAIN
await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: main.id }
)
console.log('republished MAIN')

function probe(html, headers) {
  const st = headers.get('server-timing') || ''
  return {
    stTheme: st.match(/theme;desc="(\d+)"/)?.[1],
    shopifyTheme: html.match(/"id":(\d+),"schema_name"/)?.[1],
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    offerStrip: html.includes('lurvox-offer-strip'),
    save5: html.includes('SAVE5'),
    saleEnds: /SALE ENDS IN/i.test(html),
    priceIncreases: html.includes('Price increases in'),
    drawerLogin: html.includes('lurvox-drawer-login'),
    oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
  }
}

for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  for (const label of ['index', 'root', 'myshopify']) {
    const u =
      label === 'index'
        ? `https://www.lurvox.in/index?cb=${Date.now()}`
        : label === 'myshopify'
          ? `https://9uwyq1-0j.myshopify.com/?cb=${Date.now()}`
          : `https://www.lurvox.in/?cb=${Date.now()}`
    const r = await fetch(u, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' },
    })
    const html = await r.text()
    const p = probe(html, r.headers)
    console.log(i, label, p)
    if (p.offerStrip && p.save5 && p.priceIncreases && !p.oldLogin) {
      console.log('SUCCESS')
      process.exit(0)
    }
  }
}
console.log('still cached — try Theme Editor Save')
process.exit(1)
