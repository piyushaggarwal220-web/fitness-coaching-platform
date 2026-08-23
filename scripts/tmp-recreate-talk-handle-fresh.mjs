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

const create = await gql(
  `mutation pageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle templateSuffix title }
      userErrors { field message }
    }
  }`,
  {
    page: {
      title: 'Talk to a coach',
      handle: 'talk-to-a-coach',
      templateSuffix: 'talk-to-a-coach',
      body: '',
      isPublished: true,
    },
  }
)
console.log('create', JSON.stringify(create.pageCreate, null, 2))

await new Promise((r) => setTimeout(r, 4000))
const html = await (await fetch('https://www.lurvox.in/pages/talk-to-a-coach?t=' + Date.now())).text()
console.log({
  template: html.match(/data-template="([^"]+)"/)?.[1],
  form: html.includes('lurvox-talk-coach__form'),
  contact: html.includes('contact-form'),
  api: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
})
