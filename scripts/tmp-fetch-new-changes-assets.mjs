import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const THEME_ID = '161375289595'
const API = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const outputDir = path.join(process.cwd(), 'scripts', 'tmp-new-changes-audit')
const keys = process.argv.slice(2)

for (const key of keys) {
  const response = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const result = await response.json()
  if (!response.ok || typeof result.asset?.value !== 'string') {
    throw new Error(`${key}: ${JSON.stringify(result)}`)
  }
  const filename = key.replaceAll('/', '__')
  fs.writeFileSync(path.join(outputDir, filename), result.asset.value)
  console.log(`${key} -> ${filename}`)
}
