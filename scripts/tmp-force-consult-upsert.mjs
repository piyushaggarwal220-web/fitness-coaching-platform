/**
 * Force GraphQL upsert of consult section + clear WA page bodies.
 * Draft theme 161294057723 only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const THEME_ID = 'gid://shopify/OnlineStoreTheme/161294057723'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
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

let section = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'),
  'utf8'
)
// Visible cache-bust marker in comment
if (!section.includes('lurvox-consult-v2')) {
  section = section.replace(
    '{% comment %}\n  LURVOX — Book a free consultation call',
    '{% comment %}\n  lurvox-consult-v2\n  LURVOX — Book a free consultation call'
  )
}

const template = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/templates-page.talk-to-a-coach.json'),
  'utf8'
)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: THEME_ID,
    files: [
      {
        filename: 'sections/lurvox-talk-to-coach.liquid',
        body: { type: 'TEXT', value: section },
      },
      {
        filename: 'templates/page.talk-to-a-coach.json',
        body: { type: 'TEXT', value: template },
      },
    ],
  }
)
console.log('upsert', JSON.stringify(upsert.themeFilesUpsert, null, 2))

// Clear WA redirect HTML from talk-coach page body
const clear = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle body templateSuffix }
      userErrors { field message }
    }
  }`,
  {
    id: 'gid://shopify/Page/134259540219',
    page: {
      body: '',
      templateSuffix: 'talk-to-a-coach',
      title: 'Book a free consultation call',
      isPublished: true,
    },
  }
)
console.log('clear talk-coach body', JSON.stringify(clear.pageUpdate, null, 2))

// Ensure talk-to-a-coach stays clean
const ensure = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle body templateSuffix title }
      userErrors { field message }
    }
  }`,
  {
    id: 'gid://shopify/Page/134354239739',
    page: {
      body: '',
      templateSuffix: 'talk-to-a-coach',
      title: 'Book a free consultation call',
      isPublished: true,
    },
  }
)
console.log('ensure talk-to-a-coach', JSON.stringify(ensure.pageUpdate, null, 2))

// Patch any remaining WA consultation links in common JSON assets via REST
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const numeric = 161294057723
async function getAsset(key) {
  const j = await fetch(
    `${REST}/themes/${numeric}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  ).then((r) => r.json())
  return j.asset?.value ?? null
}
async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${numeric}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(j).slice(0, 400))
  console.log('put', key)
}

for (const key of [
  'templates/index.json',
  'sections/footer-group.json',
  'sections/header-group.json',
]) {
  let raw = await getAsset(key)
  if (!raw) continue
  const before = raw
  raw = raw.replace(
    /https:\\\/\\\/wa\.me\\\/919220451577\?text=[^"]*consultation[^"]*/gi,
    '\\/pages\\/talk-to-a-coach'
  )
  raw = raw.replace(
    /https:\/\/wa\.me\/919220451577\?text=[^"&]*consultation[^"&]*/gi,
    '/pages/talk-to-a-coach'
  )
  // Also catch payment-unrelated coach CTAs labeled consultation
  raw = raw.replace(
    /"consultation_url"\s*:\s*"[^"]*wa\.me[^"]*"/gi,
    '"consultation_url":"\\/pages\\/talk-to-a-coach"'
  )
  if (raw !== before) await putAsset(key, raw)
  else console.log('unchanged', key)
}

console.log('DONE')
console.log(
  'Preview:',
  'https://admin.shopify.com/store/9uwyq1-0j/themes/161294057723/editor?previewPath=%2Fpages%2Ftalk-to-a-coach'
)
