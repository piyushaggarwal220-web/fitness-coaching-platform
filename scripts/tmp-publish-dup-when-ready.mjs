import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const NEW_ID = '161380106491'
const NEW_GID = `gid://shopify/OnlineStoreTheme/${NEW_ID}`

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

function probe(html) {
  return {
    showTrialPlan: html.includes('showTrialPlan'),
    hideSection: html.includes('__lurvox_hide_1month'),
    stabilize: html.includes('lurvox-stabilize-trial'),
    trialCard: html.includes('data-plan-price="179"'),
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
  }
}

// Wait until layout/theme.liquid exists on the duplicate
for (let i = 0; i < 30; i++) {
  const r = await fetch(
    `${REST}/themes/${NEW_ID}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const j = await r.json()
  const ready = Boolean(j.asset?.value)
  console.log(i, 'layout ready?', ready, 'status', r.status)
  if (ready) break
  await new Promise((r) => setTimeout(r, 5000))
  if (i === 29) throw new Error('duplicate never finished installing')
}

// Confirm header-group is clean on the duplicate
const hg = await fetch(
  `${REST}/themes/${NEW_ID}/assets.json?asset[key]=sections/header-group.json&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
const hgVal = (await hg.json()).asset?.value
if (hgVal) {
  const j = JSON.parse(hgVal)
  console.log('dup header order', j.order)
  console.log('dup has hide?', Boolean(j.sections?.lurvox_hide_1month))
}

console.log('\nPublishing', NEW_GID)
const pub = await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: NEW_GID }
)
console.log(JSON.stringify(pub, null, 2))
if (pub.themePublish.userErrors?.length) throw new Error('publish failed')

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126', 'Cache-Control': 'no-cache' },
    })
  ).text()
  const p = probe(html)
  console.log(i, p)
  if (p.themeId === NEW_ID && !p.showTrialPlan) {
    console.log('\nSUCCESS — new theme live, no flicker script')
    process.exit(0)
  }
}
process.exit(1)
