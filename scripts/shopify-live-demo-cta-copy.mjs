/**
 * Live copy: homepage demo CTA is Try the platform free.
 * Writes only to theme 162252554491 (current MAIN).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const THEME_ID = 162252554491
const TARGET_NAME = 'Copy of Live quiz-v3 2026-08-26 18:09'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const sectionPath = path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-landing-hero.liquid')

const tokenFile = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const refresh = await fetch(`https://${STORE}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokenFile.refresh_token,
  }),
})
if (refresh.ok) {
  Object.assign(tokenFile, JSON.parse(await refresh.text()))
  fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
}

const token = tokenFile.access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function restGet(url) {
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } })
  if (!res.ok) throw new Error(`GET ${url} ${res.status} ${await res.text()}`)
  return res.json()
}

const themes = (await restGet(`https://${STORE}/admin/api/2025-01/themes.json`)).themes ?? []
const theme = themes.find((item) => item.id === THEME_ID)
if (!theme) throw new Error('Theme not found')
if (theme.name.trim() !== TARGET_NAME) throw new Error(`Unexpected name: ${theme.name}`)
if (theme.role !== 'main') throw new Error(`Refusing: theme role is ${theme.role}, expected main`)
console.log(`Updating live MAIN ${theme.id} ${theme.name}`)

const index = JSON.parse(
  (
    await restGet(
      `https://${STORE}/admin/api/2025-01/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`
    )
  ).asset.value
)
if (!index.sections?.lurvox_landing_hero) throw new Error('lurvox_landing_hero missing')
Object.assign(index.sections.lurvox_landing_hero.settings, {
    lede: 'See a live coaching plan before you pay.',
    demo_ask: 'No signup. Look around first.',
    demo_label: 'Try the platform free',
})

let layout = (
  await restGet(
    `https://${STORE}/admin/api/2025-01/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`
  )
).asset?.value
const stamp = Date.now()
if (layout) {
  if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
    layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  } else {
    layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
  }
}

const gql = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${THEME_ID}`,
      files: [
        {
          filename: 'sections/lurvox-landing-hero.liquid',
          body: { type: 'TEXT', value: fs.readFileSync(sectionPath, 'utf8') },
        },
        {
          filename: 'templates/index.json',
          body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` },
        },
        ...(layout
          ? [{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } }]
          : []),
      ],
    },
  }),
})
const json = await gql.json()
if (json.errors?.length || json.data?.themeFilesUpsert?.userErrors?.length) {
  throw new Error(JSON.stringify(json, null, 2))
}
console.log(
  'Uploaded',
  json.data.themeFilesUpsert.upsertedThemeFiles.map((file) => file.filename).join(', ')
)
console.log('Live: https://www.lurvox.in/')
