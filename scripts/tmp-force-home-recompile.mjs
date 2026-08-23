import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Cache-Control': 'no-cache' }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()

async function get(key) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  return (await r.json()).asset.value
}
async function put(key, value) {
  const r = await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j)}`)
}

const stamp = Date.now()
const marker = `lurvox-home-recompile-${stamp}`

// 1. Inject invisible custom-liquid into home_blocks_v2
const index = JSON.parse(await get('templates/index.json'))
const home = index.sections.home_blocks_v2
if (!home) throw new Error('home_blocks_v2 missing')
home.blocks = home.blocks || {}
home.block_order = home.block_order || []
const bid = `lurvox_recompile_${stamp}`
home.blocks[bid] = {
  type: 'custom-liquid',
  settings: {
    custom_liquid: `<!-- ${marker} -->`,
  },
}
home.block_order.push(bid)
await put('templates/index.json', JSON.stringify(index, null, 2))
console.log('added block', bid)

// 2. Also bump a setting in header-group by rewriting with a new announcement-safe noop
const header = JSON.parse(await get('sections/header-group.json'))
// add a tiny custom CSS comment via lurvox_client_login if possible, else just re-stringify with stable sort change
header.__comment = undefined
await put('sections/header-group.json', JSON.stringify(header, null, 2) + '\n')
console.log('rewrote header-group')

// 3. Touch layout stamp again
let layout = await get('layout/theme.liquid')
const newStamp = `<!-- lurvox-cache-bust ${stamp} -->`
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, newStamp)
} else {
  layout = layout.replace('</head>', `  ${newStamp}\n</head>`)
}
await put('layout/theme.liquid', layout)
console.log('layout stamp', newStamp)

function probe(html) {
  return {
    marker: html.includes(marker),
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    showTrialPlan: html.includes('showTrialPlan'),
    hideSection: html.includes('lurvox_hide_1month'),
  }
}

console.log('\nPolling...')
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const html = await (
    await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile', 'Cache-Control': 'no-cache' },
    })
  ).text()
  const p = probe(html)
  console.log(i, p)
  if (!p.showTrialPlan && !p.hideSection) {
    console.log('\nFLUSHED')
    process.exit(0)
  }
  // also check view=
  if (i === 0) {
    const fresh = await (
      await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
    ).text()
    console.log('  view= control', probe(fresh))
  }
}
process.exit(1)
