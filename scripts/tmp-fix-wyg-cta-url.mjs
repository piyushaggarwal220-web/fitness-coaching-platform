import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.asset?.updated_at
}

const indexAsset = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())

const index = JSON.parse(indexAsset.asset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
const s = index.sections.blocks_C9E4qf.blocks[wygKey].settings

// Shopify url settings often need absolute or shopify:// links
s.cta_url = 'https://www.lurvox.in/pages/league'
s.cta_label = 'See the Consistency League →'
s.flat_list = true
s.paragraph = ''
s.highlight_text =
  'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote'

console.log('before put cta', s.cta_url, s.cta_label)
const out = JSON.stringify(index, null, 2)
console.log('index put', await putAsset('templates/index.json', out))
fs.writeFileSync(path.join('scripts', 'tmp-wyg-flat-index.json'), out)

// Also ensure league page exists and redirect works
const pages = await fetch(`${REST}/pages.json?limit=50`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())
console.log(
  'pages',
  pages.pages
    .filter((p) => /league|consist/i.test(p.handle))
    .map((p) => ({ handle: p.handle, template_suffix: p.template_suffix, id: p.id }))
)

await new Promise((r) => setTimeout(r, 4000))
console.log('done')
