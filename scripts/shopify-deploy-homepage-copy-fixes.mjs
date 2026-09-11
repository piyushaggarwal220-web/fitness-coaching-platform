/**
 * Homepage copy/nav fixes only:
 * 1) remove START — Rs 500 CTA
 * 2) See results in 90 days
 * 3) Fat loss description
 * 4) 6/12 month savings lines
 * 5) 6-month Most Popular badge
 * 6) Coach sign in → footer
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
  .access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const src = path.join('scripts', 'tmp-live-copy-fix')

const themeRes = await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })
const main = (await themeRes.json()).themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL, { method: 'POST', headers: H, body: JSON.stringify({ query, variables }) })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const files = [
  { filename: 'blocks/ai_gen_block_361650c.liquid', disk: 'blocks__ai_gen_block_361650c.liquid' },
  { filename: 'templates/index.json', disk: 'templates__index.json' },
  { filename: 'sections/footer.liquid', disk: 'sections__footer.liquid' },
]

const otherTemplates = ['templates/page.compare-plans.json', 'templates/page.compare-short.json']
for (const key of otherTemplates) {
  const live = await get(key)
  if (live && live.includes('Start in 90 days')) {
    const disk = key.replaceAll('/', '__')
    fs.writeFileSync(path.join(src, disk), live.replaceAll('Start in 90 days.', 'See results in 90 days.').replaceAll('Start in 90 days', 'See results in 90 days'))
    files.push({ filename: key, disk })
    console.log('also patched', key)
  }
}

let layout = await get('layout/theme.liquid')
if (!layout) throw new Error('layout/theme.liquid missing')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })

const upsertFiles = files.map((f) =>
  f.body
    ? f
    : {
        filename: f.filename,
        body: { type: 'TEXT', value: fs.readFileSync(path.join(src, f.disk), 'utf8') },
      }
)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: `gid://shopify/OnlineStoreTheme/${main.id}`, files: upsertFiles }
)
if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'upserted',
  upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
)

const shopData = await gql(`{
  menus(first: 25) {
    nodes {
      id
      handle
      title
      items { id title url type }
    }
  }
}`)
const mainMenu =
  shopData.menus.nodes.find((m) => m.handle === 'main-menu') ||
  shopData.menus.nodes.find((m) => /main/i.test(m.handle))
if (!mainMenu) throw new Error('main-menu not found')

const kept = mainMenu.items.filter(
  (item) =>
    item.title.toLowerCase() !== 'coach sign in' &&
    !/coach\/login/i.test(item.url || '') &&
    !/coach sign/i.test(item.title)
)
if (kept.length !== mainMenu.items.length) {
  const updated = await gql(
    `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { items { title url } }
        userErrors { field message }
      }
    }`,
    {
      id: mainMenu.id,
      title: mainMenu.title,
      items: kept.map((item) => ({ title: item.title, type: 'HTTP', url: item.url })),
    }
  )
  if (updated.menuUpdate.userErrors?.length) {
    throw new Error(JSON.stringify(updated.menuUpdate.userErrors, null, 2))
  }
  console.log(
    'menu now',
    updated.menuUpdate.menu.items.map((i) => i.title)
  )
} else {
  console.log(
    'menu already without coach',
    mainMenu.items.map((i) => i.title)
  )
}

console.log('home', `https://www.lurvox.in/?v=${stamp}`)
