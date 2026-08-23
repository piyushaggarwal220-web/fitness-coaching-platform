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

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token.access_token } }
  )
  return (await res.json()).asset
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

console.log('section new', await putAsset('sections/lurvox-consistency-league.liquid', league))
console.log('section old name', await putAsset('sections/lurvox-league.liquid', league))
console.log('tpl consistency-league', await putAsset('templates/page.consistency-league.json', template))
console.log('tpl league', await putAsset('templates/page.league.json', template))

// Fix index WYG
const indexAsset = await getAsset('templates/index.json')
const index = JSON.parse(indexAsset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
Object.assign(index.sections.blocks_C9E4qf.blocks[wygKey].settings, {
  flat_list: true,
  paragraph: '',
  highlight_text:
    'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote',
  cta_url: '/pages/league',
  cta_label: 'Open the Consistency League →',
  card_1_title: '',
  card_2_title: '',
  card_3_title: '',
  card_4_title: '',
})
// replace any old paths
let out = JSON.stringify(index, null, 2).split('/pages/consistency-league').join('/pages/league')
console.log('index', await putAsset('templates/index.json', out))

await new Promise((r) => setTimeout(r, 4000))

const checks = {}
for (const [name, url] of [
  ['league', 'https://www.lurvox.in/pages/league?v=' + Date.now()],
  ['viewLeague', 'https://www.lurvox.in/pages/consistency-league?view=league&v=' + Date.now()],
  ['stuck', 'https://www.lurvox.in/pages/consistency-league?v=' + Date.now()],
  ['home', 'https://www.lurvox.in/?v=' + Date.now()],
  ['homePreview', 'https://www.lurvox.in/?preview_theme_id=161086767355&v=' + Date.now()],
]) {
  const html = await fetch(url).then((r) => r.text())
  checks[name] = {
    template: html.match(/data-template="([^"]+)"/)?.[1],
    hasBack: html.includes('lx-league__back'),
    hasGoBack: html.includes('Go back'),
    hasRewardsFirst: html.includes('REWARDS FIRST'),
    hasDiet: html.includes('Diet tracker'),
    hasFlat: html.includes('ai-what-you-get-flat-'),
    ctaNew: html.includes('href="/pages/league"') || html.includes("href='/pages/league'"),
  }
}
console.log(JSON.stringify(checks, null, 2))
