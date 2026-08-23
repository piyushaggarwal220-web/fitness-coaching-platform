import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()

const layout = await fetch(
  `${API}/themes/${themeId}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
  { headers: H }
)
const v = (await layout.json()).asset.value
console.log('layout stamp:', v.match(/lurvox-cache-bust \d+/)?.[0])
console.log('hide-1month asset exists?', await (async () => {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=sections/lurvox-hide-1month.liquid&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  return { status: r.status, errors: j.errors, hasValue: Boolean(j.asset?.value) }
})())
