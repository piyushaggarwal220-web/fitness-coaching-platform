import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')).access_token
const themeId = 187792523515
const value = fs.readFileSync(path.join(root, 'scripts/shopify-assets/sections-lurvox-campaign.liquid'), 'utf8')
const res = await fetch(`https://9uwyq1-0j.myshopify.com/admin/api/2025-01/themes/${themeId}/assets.json`, {
  method: 'PUT',
  headers: {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ asset: { key: 'sections/lurvox-campaign.liquid', value } }),
})
const text = await res.text()
if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`)
console.log('uploaded sections/lurvox-campaign.liquid', value.length)
