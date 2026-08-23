/**
 * 1) Upsert with job polling
 * 2) Inject a unique HTML marker into fitness gallery to test if storefront uses the file
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const REST = `https://${STORE}/admin/api/2025-01`
const THEME_GID = 'gid://shopify/OnlineStoreTheme/161086767355'
const THEME = '161086767355'
const outDir = 'C:/Users/DELL/coaching-platform/scripts'
const MARKER = `AUTO_SCROLL_MARKER_${Date.now()}`

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

let fitness = fs.readFileSync(
  path.join(outDir, 'tmp-autoplay-ai_gen_block_52353f6.liquid'),
  'utf8'
)

// Inject visible HTML comment marker near the custom element open tag
if (!fitness.includes('AUTO_SCROLL_MARKER_')) {
  fitness = fitness.replace(
    /(<fitness-gallery-\{\{ ai_gen_id \}\}[^>]*>)/,
    `<!-- ${MARKER} -->\n$1`
  )
} else {
  fitness = fitness.replace(/AUTO_SCROLL_MARKER_\d+/g, MARKER)
}
fs.writeFileSync(path.join(outDir, 'tmp-autoplay-ai_gen_block_52353f6.liquid'), fitness)

const upsert = await gql(
  `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      job { id done }
      upsertedThemeFiles { filename }
      userErrors { field message code }
    }
  }`,
  {
    themeId: THEME_GID,
    files: [
      {
        filename: 'blocks/ai_gen_block_52353f6.liquid',
        body: { type: 'TEXT', value: fitness },
      },
    ],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

let job = upsert.themeFilesUpsert.job
console.log('initial job', job)

for (let i = 0; i < 20 && job && !job.done; i++) {
  await new Promise((r) => setTimeout(r, 1500))
  const j = await gql(
    `query($id: ID!) { job(id: $id) { id done } }`,
    { id: job.id }
  )
  job = j.job
  console.log('poll', i, job)
}

// REST readback
const asset = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=blocks/ai_gen_block_52353f6.liquid`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())

console.log('asset marker present', asset.asset.value.includes(MARKER))
console.log('asset updated_at', asset.asset.updated_at)
console.log('asset setupAutoplay', asset.asset.value.includes('setupAutoplay'))

// Touch index again
const indexRes = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())
let indexVal = indexRes.asset.value.replace(
  /^\/\*[\s\S]*?\*\/\s*/,
  `/* marker-bust ${MARKER} */\n`
)
await fetch(`${REST}/themes/${THEME}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token,
  },
  body: JSON.stringify({ asset: { key: 'templates/index.json', value: indexVal } }),
})

await new Promise((r) => setTimeout(r, 4000))

const urls = [
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${THEME}&cb=${Date.now()}`,
  `https://www.lurvox.in/?cb=${Date.now()}`,
]
for (const url of urls) {
  const html = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 marker-check' },
  }).then((r) => r.text())
  console.log({
    url,
    marker: html.includes(MARKER),
    setupAutoplay: html.includes('setupAutoplay'),
    totalSlides: (html.match(/this\.totalSlides[^\n]+/) || [])[0],
  })
}
