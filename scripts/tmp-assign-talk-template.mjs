import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))

async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

const pages = await gql(`{
  pages(first: 50, query: "handle:talk-to-a-coach") {
    nodes { id handle title templateSuffix }
  }
}`)
console.log('before', pages.pages.nodes)
const page = pages.pages.nodes[0]
if (!page) throw new Error('page not found')

const updated = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle templateSuffix }
      userErrors { field message }
    }
  }`,
  { id: page.id, page: { templateSuffix: 'talk-to-a-coach' } }
)
console.log('after', JSON.stringify(updated, null, 2))

const html = await (await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?v=${Date.now()}`)).text()
console.log('verified', html.includes('lurvox-talk-coach'))
