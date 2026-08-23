import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token.access_token } }
  )
  return (await res.json()).asset
}

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
  return json.asset
}

function stripAutoHeader(raw) {
  return raw.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

// 1) Delete stuck consistency-league page so redirect can own the path
const pages = await fetch(`${REST}/pages.json?limit=50`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())

const stuck = pages.pages.find((p) => p.handle === 'consistency-league')
const league = pages.pages.find((p) => p.handle === 'league')
console.log({ stuck: stuck?.id, league: league?.id })

if (stuck) {
  const del = await fetch(`${REST}/pages/${stuck.id}.json`, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token.access_token },
  })
  console.log('deleted stuck page', del.status)
}

// 2) Create URL redirect /pages/consistency-league -> /pages/league
const existingRedirects = await fetch(`${REST}/redirects.json?limit=250`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())

const already = (existingRedirects.redirects || []).find(
  (r) => r.path === '/pages/consistency-league'
)
if (already) {
  console.log('redirect exists', already)
} else {
  const created = await fetch(`${REST}/redirects.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({
      redirect: {
        path: '/pages/consistency-league',
        target: '/pages/league',
      },
    }),
  }).then((r) => r.json())
  console.log('redirect create', created.redirect || created.errors)
}

// 3) Update homepage CTA + FAQ links to /pages/league
const indexAsset = await getAsset('templates/index.json')
const index = JSON.parse(stripAutoHeader(indexAsset.value))
const contentSection = index.sections?.blocks_C9E4qf
const wygKey = Object.keys(contentSection.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
const wyg = contentSection.blocks[wygKey].settings
wyg.flat_list = true
wyg.paragraph = ''
wyg.highlight_text =
  'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote'
wyg.cta_url = '/pages/league'
wyg.cta_label = 'Open the Consistency League →'

// Update FAQ answer if it mentions consistency-league path
const jsonStr = JSON.stringify(index)
const replaced = jsonStr.split('/pages/consistency-league').join('/pages/league')
const nextIndex = JSON.parse(replaced)
// re-apply wyg settings after parse
const wyg2 = nextIndex.sections.blocks_C9E4qf.blocks[wygKey].settings
Object.assign(wyg2, {
  flat_list: true,
  paragraph: '',
  highlight_text: wyg.highlight_text,
  cta_url: '/pages/league',
  cta_label: wyg.cta_label,
  card_1_title: '',
  card_2_title: '',
  card_3_title: '',
  card_4_title: '',
  card_1_item_1_title: 'Diet tracker',
  card_1_item_1_description: 'Log meals and stay on your macros every day.',
  card_1_item_2_title: 'Workout tracker',
  card_1_item_2_description: 'Track sessions, sets, and training consistency.',
  card_1_item_3_title: 'Sleep tracker',
  card_1_item_3_description: 'Monitor recovery so your coach can adjust load.',
  card_2_item_1_title: 'Water & steps tracker',
  card_2_item_1_description: 'Daily hydration and movement in one place.',
  card_2_item_2_title: 'Habits & supplements tracker',
  card_2_item_2_description: 'Never miss the small habits that drive results.',
  card_2_item_3_title: 'Personal diet chart',
  card_2_item_3_description: 'Meals built around your prefs, allergies, and lifestyle.',
  card_3_item_1_title: 'Personal workout plan',
  card_3_item_1_description: 'Gym, home, or mixed — matched to your experience.',
  card_3_item_2_title: 'Cardio & conditioning plan',
  card_3_item_2_description: 'Programmed with your training, not random HIIT spam.',
  card_3_item_3_title: 'Weekly coach check-ins',
  card_3_item_3_description: 'Photos, measurements, and plan updates from real data.',
  card_4_item_1_title: 'Progress photos & journey page',
  card_4_item_1_description: 'See your timeline and visual proof of change.',
  card_4_item_2_title: 'Direct coach chat',
  card_4_item_2_description: 'Ask when form, hunger, travel, or schedule changes.',
  card_4_item_3_title: 'Community that pushes you forward',
  card_4_item_3_description: 'Squad accountability inside the Consistency League.',
})

const indexOut = JSON.stringify(nextIndex, null, 2)
console.log('put index', (await putAsset('templates/index.json', indexOut)).updated_at)
fs.writeFileSync(path.join('scripts', 'tmp-wyg-flat-index.json'), indexOut)

// 4) Remove layout probe if present
const layout = await getAsset('layout/theme.liquid')
if (layout.value.includes('LX-LAYOUT-PROBE-V1')) {
  const cleaned = layout.value.replace('<!-- LX-LAYOUT-PROBE-V1 -->\n', '')
  console.log('cleaned layout', (await putAsset('layout/theme.liquid', cleaned)).updated_at)
}

await new Promise((r) => setTimeout(r, 4000))

// Verify
for (const url of [
  'https://www.lurvox.in/pages/league?v=' + Date.now(),
  'https://www.lurvox.in/pages/consistency-league?v=' + Date.now(),
  'https://www.lurvox.in/?v=' + Date.now(),
]) {
  const res = await fetch(url, { redirect: 'follow' })
  const html = await res.text()
  console.log({
    url: res.url.split('?')[0],
    status: res.status,
    dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
    hasBack: html.includes('lx-league__back'),
    hasGoBack: html.includes('Go back'),
    hasDiet: html.includes('Diet tracker'),
    hasFlat: html.includes('ai-what-you-get-flat-'),
    hasRewardsFirstLabel: html.includes('REWARDS FIRST'),
    hasPrize: html.includes('Prize money up to'),
    cardGrid: (html.match(/ai-what-you-get-card-{{/g) || []).length,
    cardClass: (html.match(/ai-what-you-get-card-/g) || []).length,
  })
}
