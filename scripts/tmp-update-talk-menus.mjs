import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token.access_token,
}

async function gql(query, variables) {
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

// Update online store menus
const menus = await gql(`{
  menus(first: 20) {
    nodes {
      id
      handle
      title
      items {
        id
        title
        url
        type
        items {
          id
          title
          url
        }
      }
    }
  }
}`)

function walk(items, path = []) {
  for (const item of items || []) {
    if (/talk|coach/i.test(`${item.title} ${item.url || ''}`)) {
      console.log('menu item', path.concat(item.title).join(' > '), item.url)
    }
    walk(item.items, path.concat(item.title))
  }
}
for (const menu of menus.menus.nodes) {
  walk(menu.items, [menu.handle])
}

// Delete cursed page if present; keep talk-coach
const pages = await gql(`{
  pages(first: 20, query: "handle:talk-to-a-coach OR handle:talk-coach") {
    nodes { id handle templateSuffix }
  }
}`)
console.log('pages', pages.pages.nodes)
for (const page of pages.pages.nodes) {
  if (page.handle === 'talk-to-a-coach') {
    const del = await gql(
      `mutation ($id: ID!) { pageDelete(id: $id) { deletedPageId userErrors { message } } }`,
      { id: page.id }
    )
    console.log('deleted', del)
  }
}
