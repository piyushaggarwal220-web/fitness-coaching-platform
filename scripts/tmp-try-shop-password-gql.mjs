import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

// Discover password-related mutations/types
const schema = await gql(`{
  __schema {
    mutationType {
      fields {
        name
        args { name type { name kind ofType { name kind ofType { name } } } }
      }
    }
  }
}`)
const fields = schema.data.__schema.mutationType.fields.filter((f) =>
  /password|onlineStore|shopUpdate|storefront/i.test(f.name)
)
console.log(JSON.stringify(fields, null, 2))

// Try shopUpdate
const shop = await gql(`{ shop { id name primaryDomain { url } } }`)
console.log('shop', shop.data?.shop)

const try1 = await gql(
  `mutation {
    shopUpdate(input: { password: "tmpflush123", passwordEnabled: true }) {
      shop { id }
      userErrors { field message }
    }
  }`
)
console.log('shopUpdate try1', JSON.stringify(try1).slice(0, 500))
