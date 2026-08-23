import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

const indexAsset = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())

const raw = indexAsset.asset.value
const index = JSON.parse(raw.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
const s = index.sections.blocks_C9E4qf.blocks[wygKey].settings
console.log({
  highlight: s.highlight_text,
  paragraph: s.paragraph,
  flat_list: s.flat_list,
  cta_url: s.cta_url,
  cta_label: s.cta_label,
  card_1_title: s.card_1_title,
  item1: s.card_1_item_1_title,
})

// Force a real content change Shopify will accept
s.highlight_text =
  'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote'
s.cta_url = '/pages/league'
s.flat_list = true
s.paragraph = ''
s.eyebrow_text = 'INCLUDED WITH EVERY PLAN'
// unique bust
s.cta_label = 'See the Consistency League →'

const out = JSON.stringify(index, null, 2).split('/pages/consistency-league').join('/pages/league')
const put = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({ asset: { key: 'templates/index.json', value: out } }),
})
const putJson = await put.json()
console.log('put', putJson.asset?.updated_at, putJson.errors)

await new Promise((r) => setTimeout(r, 5000))

const home = await fetch('https://www.lurvox.in/?v=' + Date.now(), {
  headers: { 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

console.log({
  hasRewardsFirst: home.includes('REWARDS FIRST'),
  hasSeeCta: home.includes('See the Consistency League'),
  hasOpenCta: home.includes('Open the Consistency League'),
  hasFlat: home.includes('ai-what-you-get-flat-'),
  hasDiet: home.includes('Diet tracker'),
  hrefLeague: home.includes('/pages/league'),
  hrefOld: home.includes('/pages/consistency-league'),
})

const league = await fetch('https://www.lurvox.in/pages/league?v=' + Date.now()).then((r) =>
  r.text()
)
const stuck = await fetch('https://www.lurvox.in/pages/consistency-league', {
  redirect: 'manual',
}).then(async (r) => ({
  status: r.status,
  location: r.headers.get('location'),
  bodyTemplate:
    r.status === 200
      ? (await r.text()).match(/data-template="([^"]+)"/)?.[1]
      : null,
}))

console.log({
  leagueHasBack: league.includes('lx-league__back'),
  stuck,
})
