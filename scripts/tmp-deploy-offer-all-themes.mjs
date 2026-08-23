import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const dir = path.join(process.cwd(), 'scripts', 'tmp-live-main')
const files = {
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
}

async function gql(query, variables) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data
}

async function put(themeId, key, value) {
  const r = await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${themeId} ${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('updated', themeId, key)
}

async function get(themeId, key) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const j = await r.json()
  return j.asset?.value ?? null
}

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((t) => t.role === 'main')
const ids = [String(main.id), '161389281531', '161375289595'].filter((id, i, a) => {
  return a.indexOf(id) === i && themes.themes.some((t) => String(t.id) === id)
})
console.log('targets', ids)

for (const id of ids) {
  for (const [key, value] of Object.entries(files)) {
    await put(id, key, value)
  }
  const indexRaw = await get(id, 'templates/index.json')
  if (indexRaw) {
    const index = JSON.parse(indexRaw)
    for (const section of Object.values(index.sections || {})) {
      for (const block of Object.values(section.blocks || {})) {
        if (block.type === 'ai_gen_block_361650c' && block.settings) {
          block.settings.countdown_hours = 10
          block.settings.countdown_floor_hours = 5
          block.settings.urgency_label = 'PRICE INCREASES IN'
        }
      }
    }
    await put(id, 'templates/index.json', JSON.stringify(index, null, 2))
  }
  let layout = await get(id, 'layout/theme.liquid')
  if (layout) {
    layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
    layout = `<!-- lurvox-cache-bust ${Date.now()} -->\n` + layout
    await put(id, 'layout/theme.liquid', layout)
  }
}

await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: `gid://shopify/OnlineStoreTheme/${main.id}` }
)
console.log('republished', main.id)

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    offerStrip: /lurvox-offer-strip/.test(html),
    save5: /SAVE5/.test(html),
    saleEnds: /SALE ENDS IN/i.test(html),
    priceIncreases: /Price increases in/i.test(html),
    drawerLogin: /lurvox-drawer-login/.test(html),
    oldLoginStrip: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
  }
}

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  for (const url of [
    `https://www.lurvox.in/index?v=${Date.now()}&i=${i}`,
    `https://www.lurvox.in/?view=&v=${Date.now()}&i=${i}`,
  ]) {
    const html = await (
      await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
          'Cache-Control': 'no-cache',
        },
      })
    ).text()
    const state = { url: url.includes('view=') ? 'view' : 'index', ...probe(html) }
    console.log(JSON.stringify(state))
    if (
      state.offerStrip &&
      state.save5 &&
      state.saleEnds &&
      state.priceIncreases &&
      state.drawerLogin &&
      !state.oldLoginStrip
    ) {
      console.log('SUCCESS')
      process.exit(0)
    }
  }
}

console.log('assets updated on all candidate themes')
