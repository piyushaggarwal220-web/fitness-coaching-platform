import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((theme) => theme.role === 'main')

async function get(key) {
  const response = await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const json = await response.json()
  return json.asset ?? null
}

const headerGroup = await get('sections/header-group.json')
console.log('header-group updated', headerGroup?.updated_at)
const parsed = JSON.parse(headerGroup.value)
console.log('sections', Object.keys(parsed.sections))
console.log('order', parsed.order)

const section = await get('sections/lurvox-social-proof.liquid')
console.log('section updated', section?.updated_at, 'len', section?.value?.length)

for (const url of [
  `https://www.lurvox.in/index?v=${Date.now()}`,
  `https://www.lurvox.in/?view=&v=${Date.now()}`,
  `https://www.lurvox.in/pages/talk-to-a-coach?v=${Date.now()}`,
]) {
  const html = await (
    await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126' } })
  ).text()
  console.log(
    JSON.stringify({
      url: url.split('?')[0],
      stamp: html.match(/lurvox-cache-bust \d+/)?.[0] ?? null,
      social: /lurvox-social-proof/.test(html),
      sectionId: html.includes('shopify-section-sections--') && /social/.test(html),
      clientLogin: /lurvox-offer-strip|lurvox-client-login/.test(html),
      hideSection: /lurvox-hide-1month-style/.test(html),
    })
  )
}
