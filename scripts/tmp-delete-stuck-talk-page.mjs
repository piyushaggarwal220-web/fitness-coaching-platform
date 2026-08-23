import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'

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
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const del = await gql(
  `mutation pageDelete($id: ID!) {
    pageDelete(id: $id) {
      deletedPageId
      userErrors { field message }
    }
  }`,
  { id: 'gid://shopify/Page/134227329275' }
)
console.log('deleted stuck page', del.pageDelete)

await new Promise((r) => setTimeout(r, 3000))

for (const url of [
  'https://www.lurvox.in/pages/talk-to-a-coach',
  'https://www.lurvox.in/pages/talk-coach',
]) {
  const res = await fetch(url + '?t=' + Date.now(), { redirect: 'follow' })
  const html = await res.text()
  console.log(url, {
    final: res.url.split('?')[0],
    status: res.status,
    form: html.includes('lurvox-talk-coach__form'),
    api: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
    template: html.match(/data-template="([^"]+)"/)?.[1],
  })
}
