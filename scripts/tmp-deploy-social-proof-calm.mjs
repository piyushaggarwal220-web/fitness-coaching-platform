import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const themeDir = path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme')
const keys = ['sections/lurvox-hide-1month.liquid']

const themeResponse = await fetch(GQL, {
  method: 'POST',
  headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const themeResult = await themeResponse.json()
const target = themeResult.data?.themes?.nodes?.find((theme) => theme.role === 'MAIN')
if (!target) throw new Error('No live theme found')
const themeId = target.id.split('/').pop()

for (const key of keys) {
  const value = fs.readFileSync(path.join(themeDir, key), 'utf8')
  const response = await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const result = await response.json()
  if (!response.ok || result.errors) throw new Error(`${key}: ${JSON.stringify(result)}`)
  console.log(`Updated ${key}`)
}

for (const key of keys) {
  const expected = fs.readFileSync(path.join(themeDir, key), 'utf8')
  const response = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token, 'Cache-Control': 'no-cache' } }
  )
  const result = await response.json()
  const actual = result.asset?.value
  const matches = key.endsWith('.json')
    ? JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected))
    : actual === expected
  if (!response.ok || !matches) throw new Error(`Verification failed for ${key}`)
}

console.log(JSON.stringify({ ok: true, theme: target, updated: keys }))
