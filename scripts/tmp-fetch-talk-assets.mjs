import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((t) => t.role === 'main')

async function get(key) {
  const r = await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const j = await r.json()
  return j.asset?.value ?? null
}

const out = path.join(process.cwd(), 'scripts', 'tmp-live-talk')
fs.mkdirSync(out, { recursive: true })

for (const key of [
  'sections/lurvox-talk-to-coach.liquid',
  'templates/page.talk-to-a-coach.json',
]) {
  const value = await get(key)
  fs.writeFileSync(path.join(out, key.replaceAll('/', '__')), value)
  console.log('saved', key, value.length)
}
