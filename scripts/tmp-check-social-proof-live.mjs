import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((theme) => theme.role === 'main')
console.log('main', main.id, main.name)

const assets = await (await fetch(`${API}/themes/${main.id}/assets.json`, { headers })).json()
console.log(
  'social assets',
  (assets.assets || []).map((a) => a.key).filter((k) => /social|proof|login/i.test(k))
)

async function get(key) {
  const response = await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const json = await response.json()
  return json.asset?.value ?? null
}

const headerGroup = await get('sections/header-group.json')
if (headerGroup) {
  const parsed = JSON.parse(headerGroup)
  console.log('header sections', Object.keys(parsed.sections || {}))
  console.log('header order', parsed.order)
  console.log('social settings', JSON.stringify(parsed.sections?.lurvox_social_proof))
}

const html = await (
  await fetch(`https://www.lurvox.in/index?social=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile' },
  })
).text()

console.log({
  hasSocialMarkup: /lurvox-social-proof/.test(html),
  hasSocialSection: html.includes('shopify-section-lurvox_social_proof'),
  hasJoinPhrase: /just (started|joined|took|enrolled)/i.test(html),
})
