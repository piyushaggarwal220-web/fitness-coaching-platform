/**
 * Force storefront to pick up carousel autoplay via REST asset PUT + index touch.
 * GraphQL upsert wrote files, but rendered homepage still showed pre-patch JS.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const THEME = '161086767355'
const outDir = 'C:/Users/DELL/coaching-platform/scripts'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(`${key}: ${JSON.stringify(json.errors || json, null, 2)}`)
  }
  return { key: json.asset.key, updated_at: json.asset.updated_at }
}

const files = [
  'blocks/ai_gen_block_52353f6.liquid',
  'blocks/ai_gen_block_a7d1b3c.liquid',
  'blocks/ai_gen_block_cd3c949.liquid',
  'blocks/ai_gen_block_3cbb200.liquid',
]

const results = []
for (const key of files) {
  const local = path.join(
    outDir,
    `tmp-autoplay-${key.replace('blocks/', '').replace('.liquid', '')}.liquid`
  )
  const value = fs.readFileSync(local, 'utf8')
  if (!value.includes('setupAutoplay()')) {
    throw new Error(`Local patched file missing setupAutoplay: ${local}`)
  }
  results.push(await putAsset(key, value))
}

// Touch index.json (comment bump) to invalidate section render cache
const indexRes = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())

let indexVal = indexRes.asset.value
const stamp = `/* autoplay-bust ${new Date().toISOString()} */\n`
if (indexVal.startsWith('/*')) {
  indexVal = indexVal.replace(/^\/\*[\s\S]*?\*\/\s*/, stamp)
} else {
  indexVal = stamp + indexVal
}
results.push(await putAsset('templates/index.json', indexVal))

// Also GraphQL upsert as belt-and-suspenders
const gqlRes = await fetch(API, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
      files: files.map((filename) => ({
        filename,
        body: {
          type: 'TEXT',
          value: fs.readFileSync(
            path.join(
              outDir,
              `tmp-autoplay-${filename.replace('blocks/', '').replace('.liquid', '')}.liquid`
            ),
            'utf8'
          ),
        },
      })),
    },
  }),
}).then((r) => r.json())

if (gqlRes.errors || gqlRes.data?.themeFilesUpsert?.userErrors?.length) {
  throw new Error(JSON.stringify(gqlRes.errors || gqlRes.data.themeFilesUpsert.userErrors, null, 2))
}

// Wait briefly then probe storefront
await new Promise((r) => setTimeout(r, 3000))

const probes = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${THEME}&cb=${Date.now()}`,
]

const pages = []
for (const url of probes) {
  const html = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 autoplay-verify',
    },
  }).then((r) => r.text())
  const fitness = html.match(
    /class FitnessGallery[\s\S]*?customElements\.define\('fitness-gallery[^']+'/
  )
  pages.push({
    url,
    setupAutoplay: html.includes('setupAutoplay'),
    scheduleResume: html.includes('scheduleResumeAutoplay'),
    autoplayMs: html.includes('_autoplayMs = 3500'),
    scrollableThumbs: html.includes('max-width: calc(100% - 100px)'),
    totalSlidesLine: fitness
      ? (fitness[0].match(/this\.totalSlides[^\n]+/) || [])[0]
      : null,
  })
}

console.log(JSON.stringify({ restPuts: results, gqlUpserted: gqlRes.data.themeFilesUpsert.upsertedThemeFiles, pages }, null, 2))
