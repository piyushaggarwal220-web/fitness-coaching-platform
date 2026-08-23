/**
 * Confirm MAIN theme id and compare asset vs storefront/preview render.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const REST = `https://${STORE}/admin/api/2025-01`
const outDir = 'C:/Users/DELL/coaching-platform/scripts'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const live = JSON.parse(fs.readFileSync(path.join(outDir, 'tmp-live-theme-meta.json'), 'utf8'))

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

const themes = await gql(`{
  themes(first: 20) {
    nodes { id name role updatedAt }
  }
}`)

const numericId = live.id.split('/').pop()

// REST asset readback
const assetRes = await fetch(
  `${REST}/themes/${numericId}/assets.json?asset[key]=blocks/ai_gen_block_52353f6.liquid`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
)
const assetJson = await assetRes.json()
const assetVal = assetJson.asset?.value || ''

const previewUrls = [
  `https://www.lurvox.in/?preview_theme_id=${numericId}&v=${Date.now()}`,
  `https://${STORE}/?preview_theme_id=${numericId}&v=${Date.now()}`,
  `https://www.lurvox.in/?v=${Date.now()}`,
]

const pages = []
for (const url of previewUrls) {
  const html = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    redirect: 'follow',
  }).then((r) => r.text())
  const classIdx = html.search(/class FitnessGallery/)
  const snippet = classIdx >= 0 ? html.slice(classIdx, classIdx + 700) : null
  pages.push({
    url,
    setupAutoplay: html.includes('setupAutoplay'),
    autoAdvance: html.includes('autoAdvance'),
    totalSlidesHardcoded5: /this\.totalSlides\s*=\s*5/.test(html),
    totalSlidesDynamic: html.includes("querySelectorAll('[data-slide]')"),
    snippet,
  })
}

console.log(
  JSON.stringify(
    {
      metaTheme: live,
      themes: themes.themes.nodes,
      restAsset: {
        key: assetJson.asset?.key,
        updated_at: assetJson.asset?.updated_at,
        setupAutoplay: assetVal.includes('setupAutoplay()'),
        setInterval: assetVal.includes('setInterval'),
        totalSlidesDynamic: assetVal.includes("querySelectorAll('[data-slide]')"),
      },
      pages,
    },
    null,
    2
  )
)
