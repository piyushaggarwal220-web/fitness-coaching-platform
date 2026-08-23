/**
 * Duplicate MAIN (published) theme → unpublished draft, then replace header only.
 * Keeps published homepage content. NEVER writes to MAIN / never publishes.
 *
 * Auth: node scripts/shopify-pkce-auth.mjs
 * Run:  node scripts/shopify-header-redesign-draft.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const SITE = 'https://www.lurvox.in'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const draftMetaPath = path.join(process.env.TEMP, 'shopify-header-redesign-draft.json')

const sectionPath = path.join(__dirname, 'shopify-assets', 'sections-lurvox-header-redesign.liquid')
const headerGroupPath = path.join(
  __dirname,
  'shopify-assets',
  'sections-header-group.header-redesign.json'
)

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}
if (!fs.existsSync(sectionPath) || !fs.existsSync(headerGroupPath)) {
  console.error('Missing header redesign assets')
  process.exit(1)
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const sectionLiquid = fs.readFileSync(sectionPath, 'utf8')
const headerGroupJson = fs.readFileSync(headerGroupPath, 'utf8')
JSON.parse(headerGroupJson)

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
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

function themeNumericId(gid) {
  const m = String(gid).match(/OnlineStoreTheme\/(\d+)/)
  if (!m) throw new Error('Could not parse theme numeric id from ' + gid)
  return m[1]
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN theme found')

const draftName = `LURVOX Header Redesign ${new Date().toISOString().slice(0, 10)}`

let draft = null
if (fs.existsSync(draftMetaPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(draftMetaPath, 'utf8'))
    const existing = themes.themes.nodes.find((t) => t.id === meta.draftThemeId)
    if (existing && existing.role !== 'MAIN') {
      draft = existing
      console.log('Reusing draft theme:', draft.name, draft.id)
    }
  } catch {
    // create below
  }
}

if (!draft) {
  draft = themes.themes.nodes.find(
    (t) => t.role !== 'MAIN' && t.name?.startsWith('LURVOX Header Redesign')
  )
  if (draft) console.log('Reusing named draft theme:', draft.name, draft.id)
}

if (!draft) {
  console.log('Duplicating MAIN theme →', draftName)
  const dup = await gql(
    `mutation themeDuplicate($id: ID!, $name: String) {
      themeDuplicate(id: $id, name: $name) {
        newTheme { id name role }
        userErrors { field message }
      }
    }`,
    { id: main.id, name: draftName }
  )
  if (dup.themeDuplicate.userErrors?.length) {
    throw new Error(JSON.stringify(dup.themeDuplicate.userErrors, null, 2))
  }
  draft = dup.themeDuplicate.newTheme
  console.log('Created draft theme:', draft.name, draft.id)
}

if (!draft?.id) throw new Error('Draft theme missing')
if (draft.id === main.id || draft.role === 'MAIN') {
  throw new Error('REFUSING to write: target theme is MAIN / live')
}

fs.writeFileSync(
  draftMetaPath,
  JSON.stringify(
    {
      draftThemeId: draft.id,
      draftThemeName: draft.name,
      mainThemeId: main.id,
      mainThemeName: main.name,
      createdAt: new Date().toISOString(),
      previewUrl: `${SITE}/?preview_theme_id=${themeNumericId(draft.id)}`,
    },
    null,
    2
  )
)

async function upsertFiles(files, label) {
  console.log(label)
  const upsert = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: draft.id, files }
  )
  if (upsert.themeFilesUpsert.userErrors?.length) {
    throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
  }
  return upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
}

async function restPutAsset(themeNumeric, key, value) {
  const REST = `https://${STORE}/admin/api/2025-01`
  const res = await fetch(`${REST}/themes/${themeNumeric}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) {
    throw new Error(`REST PUT ${key} ${res.status} ${(await res.text()).slice(0, 400)}`)
  }
}

const upsertedSection = await upsertFiles(
  [
    {
      filename: 'sections/lurvox-header-redesign.liquid',
      body: { type: 'TEXT', value: sectionLiquid },
    },
  ],
  'Uploading header section to draft only…'
)

// Section groups are more reliable via REST Asset API than GraphQL upsert.
const numericId = themeNumericId(draft.id)
console.log('Uploading header-group.json via REST to draft only…')
await restPutAsset(numericId, 'sections/header-group.json', headerGroupJson)

const getRes = await fetch(
  `https://${STORE}/admin/api/2025-01/themes/${numericId}/assets.json?asset[key]=${encodeURIComponent('sections/header-group.json')}&t=${Date.now()}`,
  {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
  }
)
const got = (await getRes.json()).asset?.value || ''
if (!/lurvox-header-redesign/.test(got)) {
  throw new Error('header-group.json did not persist redesign on draft')
}
const result = {
  ok: true,
  published: false,
  wroteToMain: false,
  draftThemeId: draft.id,
  draftThemeName: draft.name,
  mainThemeId: main.id,
  mainThemeName: main.name,
  upserted: [...upsertedSection, 'sections/header-group.json'],
  previewUrl: `${SITE}/?preview_theme_id=${numericId}`,
  liveUrl: SITE + '/',
  note: 'Published homepage content kept. Only header redesigned on draft.',
}

fs.writeFileSync(
  path.join(__dirname, 'tmp-header-redesign-deploy.json'),
  JSON.stringify(result, null, 2)
)
console.log(JSON.stringify(result, null, 2))
