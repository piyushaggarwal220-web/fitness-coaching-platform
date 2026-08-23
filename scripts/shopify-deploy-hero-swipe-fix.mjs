import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

async function putAsset(key, file) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      asset: {
        key,
        value: fs.readFileSync(path.join(ROOT, file), 'utf8'),
      },
    }),
  })
  if (!res.ok) throw new Error(`${key} ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

await putAsset(
  'blocks/ai_gen_block_52353f6.liquid',
  'scripts/shopify-assets/blocks-ai_gen_block_52353f6.liquid'
)
await putAsset(
  'blocks/ai_gen_block_cd3c949.liquid',
  'scripts/shopify-assets/blocks-ai_gen_block_cd3c949.liquid'
)
console.log('live', `https://www.lurvox.in/?v=swipeup${Date.now()}`)
