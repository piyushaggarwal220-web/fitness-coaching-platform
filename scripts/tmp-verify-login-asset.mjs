import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 5) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()

const key = 'sections/lurvox-client-login.liquid'
const r = await fetch(
  `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers: H }
)
const a = (await r.json()).asset
console.log('updated_at', a.updated_at, 'bytes', a.value.length)
console.log('has stabilize:', a.value.includes('lurvox-stabilize-trial'))
console.log('has min-width 6.2em:', a.value.includes('min-width: 6.2em'))
console.log('has tabular-nums:', a.value.includes('tabular-nums'))
