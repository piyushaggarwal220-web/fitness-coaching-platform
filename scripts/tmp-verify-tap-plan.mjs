import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const THEME_ID = '161375289595'
const THEME_GID = `gid://shopify/OnlineStoreTheme/${THEME_ID}`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

const themes = await gql('{ themes(first: 50) { nodes { id name role } } }')
const main = themes.data.themes.nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main)

const assetRes = await fetch(
  `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('blocks/ai_gen_block_361650c.liquid')}`,
  { headers: H }
)
const asset = await assetRes.json()
const value = asset.asset?.value || ''
console.log({
  hasTap: value.includes('window.location.href = link'),
  hasCtaButton: value.includes('data-cta-button'),
  hasAddToCart: /ADD TO CART/i.test(value),
})

if (main?.id !== THEME_GID) {
  console.log('Republishing New changes...')
  const pub = await gql(
    `mutation($id: ID!) {
      themePublish(id: $id) {
        theme { id name role }
        userErrors { message }
      }
    }`,
    { id: THEME_GID }
  )
  console.log(JSON.stringify(pub, null, 2))
}

function probe(html, label) {
  return {
    label,
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    hasTap: html.includes('window.location.href = link'),
    hasCtaButton: /data-cta-button/.test(html),
    hasAddToCart: /ADD TO CART/i.test(html),
  }
}

for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const live = await (
    await fetch(`https://www.lurvox.in/?x=${Date.now()}&i=${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
    })
  ).text()
  const preview = await (
    await fetch(
      `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${THEME_ID}&x=${Date.now()}&i=${i}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } }
    )
  ).text()

  const liveP = probe(live, 'live')
  const prevP = probe(preview, 'preview')
  console.log(i, JSON.stringify(liveP), JSON.stringify(prevP))

  if (
    liveP.themeId === THEME_ID &&
    liveP.hasTap &&
    !liveP.hasCtaButton &&
    !liveP.hasAddToCart
  ) {
    console.log('LIVE OK')
    process.exit(0)
  }
}

console.log('Finished polling')
