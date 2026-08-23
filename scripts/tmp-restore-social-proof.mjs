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
const main = themes.themes.find((theme) => theme.role === 'main')
if (!main) throw new Error('Main theme not found')
console.log('main', main.id, main.name)

async function get(key) {
  const response = await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const json = await response.json()
  return json.asset?.value ?? null
}

async function put(key, value) {
  const response = await fetch(`${API}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 300)}`)
  console.log('updated', key)
}

const localSection = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'sections', 'lurvox-social-proof.liquid'),
  'utf8'
)
await put('sections/lurvox-social-proof.liquid', localSection)

const headerGroup = JSON.parse(await get('sections/header-group.json'))
headerGroup.sections = headerGroup.sections || {}
headerGroup.sections.lurvox_social_proof = {
  type: 'lurvox-social-proof',
  settings: {
    enabled: true,
    interval_seconds: 45,
    visible_seconds: 5,
    accent_color: '#FF6200',
  },
}
if (!Array.isArray(headerGroup.order)) headerGroup.order = []
if (!headerGroup.order.includes('lurvox_social_proof')) {
  const anchor = headerGroup.order.indexOf('header_section')
  const position = anchor === -1 ? headerGroup.order.length : anchor
  headerGroup.order.splice(position, 0, 'lurvox_social_proof')
}
await put('sections/header-group.json', JSON.stringify(headerGroup, null, 2))

// cache bust
let layout = await get('layout/theme.liquid')
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
layout = `<!-- lurvox-cache-bust ${Date.now()} -->\n` + layout
await put('layout/theme.liquid', layout)

for (let i = 0; i < 8; i++) {
  await new Promise((resolve) => setTimeout(resolve, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/index?sp=${Date.now()}&i=${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile' },
    })
  ).text()
  const state = {
    hasSocialMarkup: /lurvox-social-proof/.test(html),
    hasEnrolledCopy: /enrolled in/i.test(html),
    mentionsTrial: /7-Day Trial/i.test(html),
  }
  console.log(i, JSON.stringify(state))
  if (state.hasSocialMarkup && state.hasEnrolledCopy) {
    console.log('SOCIAL PROOF LIVE')
    break
  }
}
