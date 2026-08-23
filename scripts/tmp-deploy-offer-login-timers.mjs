/**
 * Deploy offer strip + drawer login + plan timer text/loop.
 */
import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

const dir = path.join(process.cwd(), 'scripts', 'tmp-live-main')

async function get(key) {
  const r = await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const j = await r.json()
  return j.asset?.value ?? null
}

async function put(key, value) {
  const r = await fetch(`${API}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j).slice(0, 400)}`)
  console.log('updated', key)
}

await put(
  'sections/lurvox-client-login.liquid',
  fs.readFileSync(path.join(dir, 'sections__lurvox-client-login.liquid'), 'utf8')
)
await put(
  'sections/header-group.json',
  fs.readFileSync(path.join(dir, 'sections__header-group.json'), 'utf8')
)
await put(
  'snippets/header-drawer.liquid',
  fs.readFileSync(path.join(dir, 'snippets__header-drawer.liquid'), 'utf8')
)
await put(
  'blocks/ai_gen_block_361650c.liquid',
  fs.readFileSync(path.join(dir, 'blocks__ai_gen_block_361650c.liquid'), 'utf8')
)

// Update index plan countdown settings
const index = JSON.parse(await get('templates/index.json'))
for (const section of Object.values(index.sections || {})) {
  for (const block of Object.values(section.blocks || {})) {
    if (block.type === 'ai_gen_block_361650c' && block.settings) {
      block.settings.countdown_hours = 10
      block.settings.countdown_floor_hours = 5
      block.settings.urgency_label = 'PRICE INCREASES IN'
      block.settings.show_urgency = false
    }
  }
}
await put('templates/index.json', JSON.stringify(index, null, 2))

// Touch layout cache bust
let layout = await get('layout/theme.liquid')
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
layout = `<!-- lurvox-cache-bust ${Date.now()} -->\n` + layout
await put('layout/theme.liquid', layout)

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/index?offer=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const state = {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    offerStrip: /lurvox-offer-strip/.test(html),
    save5: /SAVE5/.test(html),
    saleEnds: /SALE ENDS IN/i.test(html),
    priceIncreases: /Price increases in/i.test(html),
    drawerLogin: /lurvox-drawer-login/.test(html),
    oldLoginStrip: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
  }
  console.log(i, JSON.stringify(state))
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

console.log('deployed — hard refresh /index if cache sticky')
