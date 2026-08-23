/**
 * Deploy cart builder to draft theme named "new new" (or closest match).
 * Creates /pages/build-your-package with template cart-builder.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOP = '9uwyq1-0j.myshopify.com'
const REST = `https://${SHOP}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function rest(pathname, init = {}) {
  const res = await fetch(`${REST}${pathname}`, {
    ...init,
    headers: { ...H, ...(init.headers || {}) },
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${pathname} ${res.status} ${text}`)
  return json
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

const themes = (await rest('/themes.json')).themes || []
console.log(
  'themes',
  themes.map((t) => `${t.id} ${t.role} ${t.name}`).join('\n')
)

const draft =
  themes.find((t) => /^new\s*new$/i.test(String(t.name || '').trim())) ||
  themes.find((t) => /new\s*new/i.test(String(t.name || ''))) ||
  themes.find((t) => t.role === 'unpublished' && /new/i.test(String(t.name || '')))

if (!draft) throw new Error('Draft theme "new new" not found')
console.log('using theme', draft.id, draft.name, draft.role)

const themeGid = `gid://shopify/OnlineStoreTheme/${draft.id}`
const files = [
  {
    filename: 'sections/lurvox-cart-builder.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-cart-builder.liquid') },
  },
  {
    filename: 'templates/page.cart-builder.json',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/templates-page.cart-builder.json') },
  },
]

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: themeGid, files }
)
if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'upserted',
  upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
)

// Find or create page
const pagesData = await gql(`{
  pages(first: 50, query: "title:Build your package OR handle:build-your-package") {
    nodes { id handle title templateSuffix }
  }
}`)
let page = pagesData.pages.nodes.find((p) => p.handle === 'build-your-package')

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
        title: 'Build your package',
        handle: 'build-your-package',
        body: '',
        isPublished: true,
        templateSuffix: 'cart-builder',
      },
    }
  )
  if (created.pageCreate.userErrors?.length) {
    // fallback REST
    const restPage = await rest('/pages.json', {
      method: 'POST',
      body: JSON.stringify({
        page: {
          title: 'Build your package',
          handle: 'build-your-package',
          body_html: '',
          published: true,
          template_suffix: 'cart-builder',
        },
      }),
    })
    page = {
      id: `gid://shopify/Page/${restPage.page.id}`,
      handle: restPage.page.handle,
      templateSuffix: restPage.page.template_suffix,
    }
    console.log('created page via REST', page)
  } else {
    page = created.pageCreate.page
    console.log('created page', page)
  }
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
      page: { templateSuffix: 'cart-builder', isPublished: true },
    }
  )
  if (updated.pageUpdate.userErrors?.length) {
    console.warn('pageUpdate errors', updated.pageUpdate.userErrors)
  } else {
    page = updated.pageUpdate.page
    console.log('updated page', page)
  }
}

console.log(
  'preview',
  `https://www.lurvox.in/pages/build-your-package?preview_theme_id=${draft.id}&v=cart1`
)
