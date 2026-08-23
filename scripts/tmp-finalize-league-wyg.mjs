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

const league = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  'utf8'
)
const template = `{
  "sections": {
    "main": {
      "type": "lurvox-consistency-league",
      "settings": {}
    }
  },
  "order": ["main"]
}
`

console.log('restore section', await putAsset('sections/lurvox-consistency-league.liquid', league))
console.log('restore page.consistency-league.json', await putAsset('templates/page.consistency-league.json', template))
console.log('restore page.league.json', await putAsset('templates/page.league.json', template))

// Redirect old path -> working page (delete existing page at consistency-league first so redirect can take over)
const pages = await fetch(`${REST}/pages.json?limit=50`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())

const stuckPage = pages.pages.find((p) => p.handle === 'consistency-league')
const leaguePage = pages.pages.find((p) => p.handle === 'league')
console.log({ stuckPage: stuckPage?.id, leaguePage: leaguePage?.id })

if (stuckPage) {
  await fetch(`${REST}/pages/${stuckPage.id}.json`, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token.access_token },
  })
  console.log('deleted consistency-league page again')
}

// Ensure redirect
const redirects = await fetch(`${REST}/redirects.json?limit=250`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())
const existing = (redirects.redirects || []).find((r) => r.path === '/pages/consistency-league')
if (!existing) {
  const created = await fetch(`${REST}/redirects.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({
      redirect: { path: '/pages/consistency-league', target: '/pages/league' },
    }),
  }).then((r) => r.json())
  console.log('redirect', created.redirect || created.errors)
} else {
  console.log('redirect ok', existing)
}

// Update index CTAs + highlight (force change by bumping eyebrow)
const indexAsset = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())
const index = JSON.parse(indexAsset.asset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
const s = index.sections.blocks_C9E4qf.blocks[wygKey].settings
s.flat_list = true
s.paragraph = ''
s.highlight_text =
  'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote'
s.cta_url = '/pages/league'
s.cta_label = 'Open the Consistency League →'
s.eyebrow_text = 'INCLUDED WITH EVERY PLAN'
s.card_1_title = ''
s.card_2_title = ''
s.card_3_title = ''
s.card_4_title = ''

let out = JSON.stringify(index, null, 2)
out = out.split('/pages/consistency-league').join('/pages/league')
console.log('index', await putAsset('templates/index.json', out))
fs.writeFileSync(path.join('scripts', 'tmp-wyg-flat-index.json'), out)
fs.writeFileSync(
  path.join('scripts', 'shopify-assets', 'templates-page.league.json'),
  template
)

console.log('done')
