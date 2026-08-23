/**
 * Draft-only: Plan Finder quiz page + hero/sticky CTAs
 * Theme: Copy of Copy of Offer live 2026-08-05 19:59 (161434501371)
 *
 * - /pages/find-your-plan (5-tap quiz → recommend 3/6/12)
 * - Hero CTA → plan finder
 * - Sticky / conversion boost primary → plan finder
 * Does NOT publish.
 *
 * Preview:
 *   https://www.lurvox.in/?preview_theme_id=161434501371
 *   https://www.lurvox.in/pages/find-your-plan?preview_theme_id=161434501371
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const THEME_ID = Number(process.argv[2] || 161434501371)
const EXPECTED_NAME = 'Copy of Copy of Offer live 2026-08-05 19:59'
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const PAGE_HANDLE = 'find-your-plan'
const TEMPLATE_SUFFIX = 'find-your-plan'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${method} ${urlPath}: ${res.status} ${text.slice(0, 500)}`)
  return json
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function putAsset(key, value) {
  await api('PUT', `/themes/${THEME_ID}/assets.json`, { asset: { key, value } })
  console.log('uploaded', key)
}

function readLocal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

async function ensurePage() {
  const listed = await gql(
    `{
      pages(first: 50, query: "handle:${PAGE_HANDLE}") {
        nodes { id handle title templateSuffix isPublished }
      }
    }`
  )
  let page = listed.pages.nodes.find((p) => p.handle === PAGE_HANDLE) || null

  if (!page) {
    const create = await gql(
      `mutation pageCreate($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { id handle templateSuffix isPublished title }
          userErrors { field message }
        }
      }`,
      {
        page: {
          title: 'Find your plan',
          handle: PAGE_HANDLE,
          templateSuffix: TEMPLATE_SUFFIX,
          isPublished: true,
          body: '',
        },
      }
    )
    if (create.pageCreate.userErrors?.length) {
      throw new Error('pageCreate: ' + JSON.stringify(create.pageCreate.userErrors))
    }
    page = create.pageCreate.page
    console.log('created page', page)
  } else {
    const update = await gql(
      `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id handle templateSuffix title isPublished }
          userErrors { field message }
        }
      }`,
      {
        id: page.id,
        page: {
          title: 'Find your plan',
          templateSuffix: TEMPLATE_SUFFIX,
          isPublished: true,
        },
      }
    )
    if (update.pageUpdate.userErrors?.length) {
      throw new Error('pageUpdate: ' + JSON.stringify(update.pageUpdate.userErrors))
    }
    page = update.pageUpdate.page
    console.log('updated page', page)
  }

  return page
}

async function main() {
  const themeRes = await api('GET', `/themes/${THEME_ID}.json`)
  const theme = themeRes.theme
  console.log('Target theme:', theme?.id, theme?.name, theme?.role)
  if (!theme) throw new Error('Theme not found')
  if (theme.role === 'main') throw new Error('Refusing to write to MAIN theme')
  if (String(theme.name) !== EXPECTED_NAME) {
    console.warn('WARNING: theme name mismatch. Expected:', EXPECTED_NAME, 'got:', theme.name)
  }

  await putAsset(
    'sections/lurvox-plan-finder.liquid',
    readLocal('scripts/shopify-assets/sections-lurvox-plan-finder.liquid')
  )
  await putAsset(
    'templates/page.find-your-plan.json',
    readLocal('scripts/shopify-assets/templates-page.find-your-plan.json')
  )
  await putAsset(
    'snippets/lurvox-conversion-boost.liquid',
    readLocal('scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid')
  )
  await putAsset(
    'blocks/ai_gen_block_52353f6.liquid',
    readLocal('scripts/shopify-assets/blocks-ai_gen_block_52353f6.liquid')
  )

  const page = await ensurePage()

  console.log(
    JSON.stringify(
      {
        ok: true,
        themeId: THEME_ID,
        themeName: theme.name,
        page: page.handle,
        previewHome: `https://www.lurvox.in/?preview_theme_id=${THEME_ID}`,
        previewQuiz: `https://www.lurvox.in/pages/find-your-plan?preview_theme_id=${THEME_ID}`,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
