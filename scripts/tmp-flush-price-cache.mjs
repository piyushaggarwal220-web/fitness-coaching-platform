/**
 * Brief theme publish dance to flush Shopify homepage HTML cache,
 * then restore MAIN = Copy of Offer live (correct ₹999/1699/2999 assets).
 */
import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const MAIN = 'gid://shopify/OnlineStoreTheme/161429127419'
const TEMP = 'gid://shopify/OnlineStoreTheme/161391804667' // Offer live (also has synced prices)

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

async function publish(id, label) {
  const data = await gql(
    `mutation($id:ID!){ themePublish(id:$id){ theme{name role} userErrors{message}}}`,
    { id }
  )
  console.log('publish', label, data.themePublish)
}

async function check() {
  const html = await (
    await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': `flush/${Date.now()}` },
    })
  ).text()
  return {
    old2699: /₹\s*2,?699/.test(html),
    has999: /₹\s*999/.test(html),
    has2999: /₹\s*2,?999/.test(html),
    matrix: ((html.match(/lx-matrix__table[\s\S]{0,280}/) || [''])[0] || '').replace(/\s+/g, ' '),
  }
}

console.log('before', await check())
await publish(TEMP, 'temp Offer live')
await new Promise((r) => setTimeout(r, 5000))
await publish(MAIN, 'restore main')
await new Promise((r) => setTimeout(r, 8000))
console.log('after', await check())
for (let i = 0; i < 4; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  console.log('poll', i, await check())
}
