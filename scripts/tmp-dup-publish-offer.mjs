import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const auth = JSON.parse(
  fs.readFileSync(path.join(os.tmpdir(), 'shopify-auth-token.json'), 'utf8')
)
const token = auth.access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2024-10'
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function putAsset(themeId, key, value) {
  const r = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(`${key}: ${JSON.stringify(j.errors)}`)
  console.log('updated', themeId, key)
}

const assets = {
  'sections/lurvox-client-login.liquid': fs.readFileSync(
    path.join(dir, 'sections__lurvox-client-login.liquid'),
    'utf8'
  ),
  'sections/header-group.json': fs.readFileSync(
    path.join(dir, 'sections__header-group.json'),
    'utf8'
  ),
  'snippets/header-drawer.liquid': fs.readFileSync(
    path.join(dir, 'snippets__header-drawer.liquid'),
    'utf8'
  ),
  'blocks/ai_gen_block_361650c.liquid': fs.readFileSync(
    path.join(dir, 'blocks__ai_gen_block_361650c.liquid'),
    'utf8'
  ),
  'templates/index.json': fs.readFileSync(
    path.join(dir, 'templates__index.json'),
    'utf8'
  ),
}

function probe(html) {
  const theme =
    html.match(/Shopify\.theme\s*=\s*\{[\s\S]*?id:\s*['"]?(\d+)/)?.[1] ||
    html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1]
  return {
    theme,
    offerStrip: html.includes('lurvox-offer-strip'),
    save5: html.includes('SAVE5'),
    saleEnds: /SALE ENDS IN/i.test(html),
    priceIncreases: html.includes('Price increases in'),
    drawerLogin: html.includes('lurvox-drawer-login'),
    oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
  }
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const nodes = themes.themes.nodes
console.log(
  'themes',
  nodes.length,
  nodes.map((t) => `${t.role}:${t.name}:${t.id.split('/').pop()}`).join(' | ')
)
const main = nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main)

// Ensure MAIN has latest assets (incl. countdown 10)
const mainNum = main.id.split('/').pop()
for (const [key, value] of Object.entries(assets)) {
  await putAsset(mainNum, key, value)
}

// Free a slot if at limit
if (nodes.length >= 20) {
  const deletable = nodes.find(
    (t) =>
      t.role !== 'MAIN' &&
      (t.name.includes('Horizon') ||
        t.name.includes('Copy of') ||
        t.name.includes('Tap plan') ||
        t.name.includes('stable'))
  )
  if (deletable) {
    console.log('deleting', deletable.name, deletable.id)
    const del = await gql(
      `mutation($id: ID!) {
        themeDelete(id: $id) { deletedThemeId userErrors { message } }
      }`,
      { id: deletable.id }
    )
    console.log('deleted', JSON.stringify(del))
  }
}

const name = `Offer strip live ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
console.log('duplicating', name)
const dup = await gql(
  `mutation($id: ID!, $name: String!) {
    themeDuplicate(id: $id, name: $name) {
      newTheme { id name role }
      userErrors { field message }
    }
  }`,
  { id: main.id, name }
)
console.log(JSON.stringify(dup, null, 2))
const newTheme = dup.themeDuplicate?.newTheme
if (!newTheme?.id) throw new Error('duplicate failed')
const newNum = newTheme.id.split('/').pop()

// Re-apply assets on duplicate in case duplicate raced
for (const [key, value] of Object.entries(assets)) {
  await putAsset(newNum, key, value)
}

console.log('publishing', newNum)
const pub = await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: newTheme.id }
)
console.log(JSON.stringify(pub, null, 2))

for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const urls = [
    `https://www.lurvox.in/index?cb=${Date.now()}`,
    `https://www.lurvox.in/?view=&cb=${Date.now()}`,
    `https://www.lurvox.in/?preview_theme_id=${newNum}&cb=${Date.now()}`,
  ]
  for (const u of urls) {
    const html = await (
      await fetch(u, {
        headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' },
      })
    ).text()
    const p = probe(html)
    console.log(i, u.includes('preview') ? 'preview' : u.includes('index') ? 'index' : 'view', p)
    if (p.offerStrip && p.save5 && p.priceIncreases && !p.oldLogin) {
      console.log('SUCCESS')
      process.exit(0)
    }
  }
}

console.log('not fully live yet — preview may still confirm assets')
process.exit(1)
