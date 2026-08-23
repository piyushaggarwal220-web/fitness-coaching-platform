import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
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
  { id: 'gid://shopify/Page/134227296507' }
)
console.log('delete stuck', del.pageDelete)

const rename = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle templateSuffix title }
      userErrors { field message }
    }
  }`,
  {
    id: 'gid://shopify/Page/134227329275',
    page: {
      handle: 'talk-to-a-coach',
      title: 'Talk to a coach',
      templateSuffix: 'talk-to-a-coach',
    },
  }
)
console.log('rename working page', JSON.stringify(rename.pageUpdate, null, 2))

await new Promise((r) => setTimeout(r, 4000))

for (const url of [
  'https://www.lurvox.in/pages/talk-to-a-coach',
  'https://9uwyq1-0j.myshopify.com/pages/talk-to-a-coach',
]) {
  const html = await (await fetch(url + '?t=' + Date.now())).text()
  console.log(url, {
    template: html.match(/data-template="([^"]+)"/)?.[1],
    hasForm: html.includes('lurvox-talk-coach__form'),
    hasApi: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
  })
}
