import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const themesResponse = await fetch(`${API}/themes.json`, { headers })
const themes = await themesResponse.json()
const main = themes.themes?.find((theme) => theme.role === 'main')
if (!main) throw new Error('Main theme not found')

const key = 'blocks/ai_gen_block_361650c.liquid'
const value = fs.readFileSync(
  path.join(
    process.cwd(),
    'scripts',
    'tmp-new-changes-theme',
    'blocks',
    'ai_gen_block_361650c.liquid'
  ),
  'utf8'
)

const response = await fetch(`${API}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key, value } }),
})
const result = await response.json()
if (!response.ok || result.errors) {
  throw new Error(JSON.stringify(result))
}

const deployed = result.asset?.value || value
console.log(
  JSON.stringify({
    themeId: main.id,
    themeName: main.name,
    updated: result.asset?.updated_at,
    whiteOutlinePresent: /border:\s*2px\s+solid\s+#ffffff/i.test(deployed),
  })
)
