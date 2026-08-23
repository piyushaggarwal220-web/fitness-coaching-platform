import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

async function gql(query) {
  const res = await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json', {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  return res.json()
}

const pages = await gql(`{
  pages(first: 20, query: "handle:talk*") {
    nodes { id handle title templateSuffix body }
  }
}`)
console.log(JSON.stringify(pages, null, 2))
