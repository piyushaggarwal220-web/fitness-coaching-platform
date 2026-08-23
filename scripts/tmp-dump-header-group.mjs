import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }
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

const header = await get('sections/header-group.json')
console.log('header keys sample', header?.slice(0, 500))
const cleaned = header.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
const j = JSON.parse(cleaned)
console.log(JSON.stringify(j, null, 2).slice(0, 4000))

// Find talk in index and other places
const index = JSON.parse(await get('templates/index.json'))
const str = JSON.stringify(index)
for (const needle of ['talk-to-a-coach', 'talk-coach', 'Talk to a coach', 'wa.me']) {
  console.log(needle, (str.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length)
}
