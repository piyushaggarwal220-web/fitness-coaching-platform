import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const PAGE_NUMERIC = '134114214139'

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

// REST get page
const getRes = await fetch(`${REST}/pages/${PAGE_NUMERIC}.json`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
})
const getJson = await getRes.json()
console.log('REST page before', {
  id: getJson.page?.id,
  handle: getJson.page?.handle,
  template_suffix: getJson.page?.template_suffix,
  published_at: getJson.page?.published_at,
})

// REST update template_suffix
const putRes = await fetch(`${REST}/pages/${PAGE_NUMERIC}.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({
    page: {
      id: Number(PAGE_NUMERIC),
      template_suffix: 'consistency-league',
      body_html:
        '<div style="display:none">Consistency League — certificates, trophies, prize money up to ₹5,000. Updated.</div>',
    },
  }),
})
const putJson = await putRes.json()
console.log('REST page after', {
  status: putRes.status,
  template_suffix: putJson.page?.template_suffix,
  updated_at: putJson.page?.updated_at,
  errors: putJson.errors,
})

await new Promise((r) => setTimeout(r, 5000))

async function check(label) {
  const html = await fetch(
    'https://www.lurvox.in/pages/consistency-league?nocache=' + Date.now(),
    { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }
  ).then((r) => r.text())
  console.log(label, {
    dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
    hasBack: html.includes('lx-league__back'),
    sectionIds: [...html.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]),
  })
  return html.includes('lx-league__back')
}

if (await check('after REST update')) {
  console.log('SUCCESS')
  process.exit(0)
}

// Recreate page: create new, delete old, rename handle
console.log('Recreating page...')

const create = await gql(
  `mutation pageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle templateSuffix }
      userErrors { field message }
    }
  }`,
  {
    page: {
      title: 'Consistency League',
      handle: 'consistency-league-new',
      templateSuffix: 'consistency-league',
      body: '<div style="display:none">Consistency League</div>',
      isPublished: true,
    },
  }
)
console.log('create', JSON.stringify(create.pageCreate, null, 2))
const newId = create.pageCreate.page?.id
if (!newId) throw new Error('create failed')

// Delete old page
const del = await gql(
  `mutation pageDelete($id: ID!) {
    pageDelete(id: $id) {
      deletedPageId
      userErrors { field message }
    }
  }`,
  { id: `gid://shopify/Page/${PAGE_NUMERIC}` }
)
console.log('delete old', JSON.stringify(del.pageDelete, null, 2))

// Rename new page to consistency-league
const rename = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle templateSuffix }
      userErrors { field message }
    }
  }`,
  {
    id: newId,
    page: { handle: 'consistency-league', templateSuffix: 'consistency-league' },
  }
)
console.log('rename', JSON.stringify(rename.pageUpdate, null, 2))

await new Promise((r) => setTimeout(r, 5000))
await check('after recreate')
