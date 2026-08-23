import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const OLD_ID = 'gid://shopify/Page/133883003131'

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

async function check(label) {
  const html = await fetch(
    'https://www.lurvox.in/pages/talk-to-a-coach?nocache=' + Date.now(),
    { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }
  ).then((r) => r.text())
  const result = {
    dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
    hasForm: html.includes('lurvox-talk-coach__form'),
    hasApi: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
  }
  console.log(label, result)
  return result.hasForm
}

console.log('Recreating talk-to-a-coach page to unstick template...')

const create = await gql(
  `mutation pageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle templateSuffix }
      userErrors { field message }
    }
  }`,
  {
    page: {
      title: 'Talk to a coach',
      handle: 'talk-to-a-coach-new',
      templateSuffix: 'talk-to-a-coach',
      body: '',
      isPublished: true,
    },
  }
)
console.log('create', JSON.stringify(create.pageCreate, null, 2))
const newId = create.pageCreate.page?.id
if (!newId) throw new Error('create failed')

const del = await gql(
  `mutation pageDelete($id: ID!) {
    pageDelete(id: $id) {
      deletedPageId
      userErrors { field message }
    }
  }`,
  { id: OLD_ID }
)
console.log('delete old', JSON.stringify(del.pageDelete, null, 2))

const rename = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle templateSuffix title }
      userErrors { field message }
    }
  }`,
  {
    id: newId,
    page: {
      handle: 'talk-to-a-coach',
      title: 'Talk to a coach',
      templateSuffix: 'talk-to-a-coach',
    },
  }
)
console.log('rename', JSON.stringify(rename.pageUpdate, null, 2))

await new Promise((r) => setTimeout(r, 5000))
const ok = await check('after recreate')
if (!ok) {
  // one more wait for CDN
  await new Promise((r) => setTimeout(r, 8000))
  await check('after wait')
}
