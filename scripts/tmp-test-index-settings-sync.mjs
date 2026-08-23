import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

async function get(key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset?.value
}
async function put(key, value) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  return (await res.json()).asset?.updated_at
}

const MARK = `ZZ_GONE_${Date.now()}`
const index = JSON.parse(await get('templates/index.json'))
const home = index.sections.home_blocks_v2
const planId = Object.keys(home.blocks).find((id) => String(home.blocks[id].type).includes('361650c'))
home.blocks[planId].settings.plan_1_duration = MARK
home.blocks[planId].settings.plan_1_enabled = false
console.log('setting plan_1_duration to', MARK, 'on', planId)
console.log('put', await put('templates/index.json', JSON.stringify(index, null, 2)))

const read = JSON.parse(await get('templates/index.json'))
console.log(
  'api readback duration',
  read.sections.home_blocks_v2.blocks[planId].settings.plan_1_duration
)

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const html = await fetch(
    `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${main.id}&cb=${Date.now()}-${i}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } }
  ).then((r) => r.text())
  console.log(i, {
    hasMark: html.includes(MARK),
    has1Month: html.includes('>1 Month<'),
    durations: [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)].map((m) => m[1].trim()),
  })
  if (html.includes(MARK)) {
    console.log('INDEX.JSON SETTINGS ARE LIVE')
    break
  }
}
