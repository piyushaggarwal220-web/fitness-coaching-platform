/**
 * Deploy short ad landing + updated sales closer tracking to MAIN theme.
 * Creates/updates Shopify page: /pages/start
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 400)}`)
  console.log('asset', key)
}

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
if (!main) throw new Error('No MAIN theme')
console.log('main', main.id, main.name)

const section = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-ad-landing.liquid'),
  'utf8'
)
const template = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'templates-page.start.json'),
  'utf8'
)
const closer = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-sales-closer.liquid'),
  'utf8'
)

await putAsset(main.id, 'sections/lurvox-ad-landing.liquid', section)
await putAsset(main.id, 'templates/page.start.json', template)
await putAsset(main.id, 'snippets/lurvox-sales-closer.liquid', closer)

// Create or update page handle=start
const existing = await gql(`{
  pages(first: 20, query: "title:Start OR handle:start") {
    nodes { id handle title templateSuffix }
  }
}`)
let page = existing.pages.nodes.find((p) => p.handle === 'start')

if (!page) {
  const created = await gql(
    `mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle title templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      page: {
        title: 'Start',
        handle: 'start',
        templateSuffix: 'start',
        body: '<p>LURVOX coaching — short start page for ads.</p>',
        isPublished: true,
      },
    }
  )
  if (created.pageCreate.userErrors?.length) {
    throw new Error(JSON.stringify(created.pageCreate.userErrors))
  }
  page = created.pageCreate.page
  console.log('created page', page)
} else {
  const updated = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle title templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      id: page.id,
      page: {
        title: 'Start',
        templateSuffix: 'start',
        isPublished: true,
      },
    }
  )
  if (updated.pageUpdate.userErrors?.length) {
    console.warn('page update warnings', updated.pageUpdate.userErrors)
  }
  page = updated.pageUpdate.page || page
  console.log('updated page', page.handle, page.templateSuffix)
}

console.log(
  JSON.stringify(
    {
      landing: 'https://www.lurvox.in/pages/start',
      adsUrl:
        'https://www.lurvox.in/pages/start?utm_source=ads&utm_medium=paid&utm_campaign=start_landing',
      theme: main.name,
    },
    null,
    2
  )
)
