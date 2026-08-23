import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

const shop = await gql(`{
  shop {
    name
    primaryDomain { url host }
    myshopifyDomain
  }
  onlineStore {
    passwordProtection { enabled }
  }
}`)
console.log(JSON.stringify(shop, null, 2))

// Check homepage assignment - in Shopify OS2, index template is homepage.
// Look for any URL redirect from / 
const redirects = await gql(`{
  urlRedirects(first: 20, query: "path:/") {
    nodes { path target }
  }
}`)
console.log('redirects', JSON.stringify(redirects, null, 2))
