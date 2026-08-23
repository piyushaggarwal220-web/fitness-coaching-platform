import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = [161429127419, 161391804667]
const assets = [
  [
    'snippets/lurvox-conversion-boost.liquid',
    'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid',
  ],
  [
    'snippets/lurvox-plan-compare-inline.liquid',
    'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid',
  ],
]

for (const themeId of themes) {
  for (const [key, file] of assets) {
    const value = fs.readFileSync(path.join(ROOT, file), 'utf8')
    if (key.includes('plan-compare') && !value.includes('id="plans"')) {
      throw new Error('matrix missing id=plans')
    }
    if (key.includes('conversion') && !value.includes('ensurePlansAnchor')) {
      throw new Error('boost missing ensurePlansAnchor')
    }
    const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ asset: { key, value } }),
    })
    const json = await res.json()
    if (!res.ok || json.errors) {
      throw new Error(`${themeId} ${key} ${JSON.stringify(json).slice(0, 300)}`)
    }
    console.log('ok', themeId, key)
  }
}
console.log('deployed')
