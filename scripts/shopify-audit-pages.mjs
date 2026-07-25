/**
 * Audit + harden Shopify Plans page body so inclusions match the app.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

const data = await gql(`{
  pages(first: 30) {
    nodes { id title handle body }
  }
}`)

for (const p of data.pages.nodes) {
  const body = (p.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log('\n===', p.handle, p.title, '===')
  console.log(body.slice(0, 800) || '(empty)')
}
