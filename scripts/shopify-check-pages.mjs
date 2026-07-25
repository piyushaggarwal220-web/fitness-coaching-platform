import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`

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
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

const data = await gql(`{
  pages(first: 20) {
    nodes { id title handle body }
  }
}`)

for (const page of data.pages.nodes) {
  const hasRzp = /rzp\.io|razorpay/i.test(page.body || '')
  const hasApp = /app\.lurvox\.in/i.test(page.body || '')
  console.log(`${page.handle}: rzp=${hasRzp} app=${hasApp} title=${page.title}`)
  if (hasRzp) {
    const urls = [...(page.body || '').matchAll(/https:\/\/rzp\.io\/[^\s"'<]+/g)].map((m) => m[0])
    console.log('  urls:', [...new Set(urls)])
  }
}
