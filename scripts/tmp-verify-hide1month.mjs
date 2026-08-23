import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()

const key = 'sections/lurvox-hide-1month.liquid'
const local = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'sections', 'lurvox-hide-1month.liquid'),
  'utf8'
)
const res = await fetch(
  `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token, 'Cache-Control': 'no-cache' } }
)
const remote = (await res.json()).asset.value

console.log('identical:', remote === local)
console.log('remote has <script>:', remote.includes('<script'))
console.log('remote has setTimeout:', remote.includes('setTimeout'))
console.log('remote version marker:', /lurvox-hide-allow-trial-v\d/.exec(remote)?.[0])
console.log('remote bytes:', remote.length, 'local bytes:', local.length)
if (remote !== local) {
  console.log('\n--- REMOTE ---\n' + remote)
}
