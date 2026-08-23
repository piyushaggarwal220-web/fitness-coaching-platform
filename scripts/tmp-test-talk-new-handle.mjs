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

const create = await gql(
  `mutation pageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle templateSuffix }
      userErrors { field message }
    }
  }`,
  {
    page: {
      title: 'Talk to a coach consult',
      handle: 'talk-coach-consult',
      templateSuffix: 'talk-to-a-coach',
      body: '',
      isPublished: true,
    },
  }
)
console.log(JSON.stringify(create.pageCreate, null, 2))

await new Promise((r) => setTimeout(r, 3000))

for (const url of [
  'https://www.lurvox.in/pages/talk-coach-consult',
  'https://9uwyq1-0j.myshopify.com/pages/talk-coach-consult',
  'https://www.lurvox.in/pages/talk-to-a-coach',
  'https://www.lurvox.in/pages/talk-to-a-coach?view=talk-to-a-coach',
]) {
  const html = await (await fetch(url + '?t=' + Date.now())).text()
  console.log(url, {
    template: html.match(/data-template="([^"]+)"/)?.[1],
    hasForm: html.includes('lurvox-talk-coach__form'),
  })
}

const pages = await gql(`{
  pages(first: 20, query: "title:talk*") {
    nodes { id handle title templateSuffix }
  }
}`)
console.log('pages', pages.pages.nodes)
