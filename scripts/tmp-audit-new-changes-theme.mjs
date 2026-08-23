import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const THEME_ID = '161375289595'
const API = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const response = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
  headers: { 'X-Shopify-Access-Token': token },
})
const result = await response.json()
if (!response.ok) throw new Error(JSON.stringify(result))

const assets = result.assets ?? []
const candidatePattern =
  /(header|drawer|menu|announcement|count|timer|carousel|slideshow|testimonial|gallery|plan|pricing|index|theme\.liquid|settings_data|settings_schema)/i
const candidates = assets.filter((asset) => candidatePattern.test(asset.key))

const indexAsset = candidates.find((asset) => asset.key === 'templates/index.json')
if (indexAsset) {
  const indexResponse = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(indexAsset.key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const indexResult = await indexResponse.json()
  const indexValue = indexResult.asset?.value
  if (typeof indexValue === 'string') {
    const blockTypes = [...indexValue.matchAll(/"type"\s*:\s*"(ai_gen_block_[^"]+)"/g)].map(
      (match) => match[1]
    )
    for (const blockType of new Set(blockTypes)) {
      const key = `blocks/${blockType}.liquid`
      if (!candidates.some((asset) => asset.key === key)) candidates.push({ key })
    }
  }
}

const outputDir = path.join(process.cwd(), 'scripts', 'tmp-new-changes-audit')
fs.mkdirSync(outputDir, { recursive: true })

const summary = []
for (const asset of candidates) {
  const assetResponse = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(asset.key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const assetResult = await assetResponse.json()
  if (!assetResponse.ok) continue
  const value = assetResult.asset?.value
  if (typeof value !== 'string') continue

  const filename = asset.key.replaceAll('/', '__')
  fs.writeFileSync(path.join(outputDir, filename), value)
  summary.push({
    key: asset.key,
    size: value.length,
    timer: /countdown|timer|deadline/i.test(value),
    login: /login|account/i.test(value),
    carousel: /carousel|slideshow|slider/i.test(value),
    plan: /plan|pricing/i.test(value),
  })
}

fs.writeFileSync(
  path.join(outputDir, '_summary.json'),
  JSON.stringify({ themeId: THEME_ID, assetCount: assets.length, candidates: summary }, null, 2)
)

console.log(JSON.stringify({ outputDir, assetCount: assets.length, candidates: summary }, null, 2))
