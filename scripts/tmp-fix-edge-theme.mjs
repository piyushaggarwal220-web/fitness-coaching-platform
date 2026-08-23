import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

// The edge keeps serving this theme id even after we unpublished it.
const EDGE_THEME = '161375289595'
const STABLE_THEME = '161380106491'

async function get(themeId, key) {
  const r = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const j = await r.json()
  return j.asset?.value
}
async function put(themeId, key, value) {
  const r = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j)}`)
  console.log('put', themeId, key)
}

// Copy clean files from the stable theme onto the edge theme
for (const key of [
  'sections/header-group.json',
  'templates/index.json',
  'sections/lurvox-hide-1month.liquid',
  'sections/lurvox-client-login.liquid',
  'layout/theme.liquid',
]) {
  const value = await get(STABLE_THEME, key)
  if (!value) throw new Error(`missing on stable: ${key}`)
  await put(EDGE_THEME, key, value)
}

// Publish the edge theme as MAIN so the sticky cache's theme id is "correct" AND content is clean
const pub = await fetch(`${REST}/themes/${EDGE_THEME}.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ theme: { id: Number(EDGE_THEME), role: 'main' } }),
})
console.log('publish edge theme', pub.status, (await pub.text()).slice(0, 250))

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    showTrialPlan: html.includes('showTrialPlan'),
    stabilize: html.includes('lurvox-stabilize-trial'),
    hideSection: html.includes('__lurvox_hide_1month'),
    trial: html.includes('data-plan-price="179"'),
  }
}

console.log('\nPolling...')
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const html = await (
    await fetch(`https://www.lurvox.in/?fixedge=${Date.now()}-${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126', 'Cache-Control': 'no-cache' },
    })
  ).text()
  const p = probe(html)
  console.log(i, p)
  if (!p.showTrialPlan && p.stabilize && p.trial) {
    console.log('\nEDGE SERVING CLEAN CONTENT')
    process.exit(0)
  }
}
process.exit(1)
