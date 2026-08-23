import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
console.log(
  'themes',
  themes.map((t) => ({ id: t.id, name: t.name, role: t.role, updated: t.updated_at }))
)

const html = await (await fetch('https://www.lurvox.in/?v=' + Date.now())).text()
const cdnThemeNums = [...new Set([...html.matchAll(/cdn\/shop\/t\/(\d+)\//g)].map((m) => m[1]))]
console.log('cdnThemeNums', cdnThemeNums)

// GraphQL: get OnlineStore theme
const gqlRes = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `{
      themes(first: 20) {
        nodes { id name role updatedAt }
      }
    }`,
  }),
})
const gqlJson = await gqlRes.json()
console.log('gqlThemes', gqlJson.data?.themes?.nodes)

// Try fetching matrix from each theme
for (const t of themes) {
  const res = await fetch(
    `${REST}/themes/${t.id}/assets.json?asset[key]=${encodeURIComponent('snippets/lurvox-plan-compare-inline.liquid')}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const text = await res.text()
  let val = null
  try {
    val = JSON.parse(text).asset?.value
  } catch {
    continue
  }
  if (!val) continue
  const prices = val.match(/<strong>₹[^<]+<\/strong>/g)
  console.log(t.id, t.role, t.name, prices)
}
