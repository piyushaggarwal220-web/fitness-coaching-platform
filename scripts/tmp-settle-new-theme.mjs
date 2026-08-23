import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const old = themes.themes.nodes.find((t) => t.name === 'New changes' && t.role !== 'MAIN')
console.log('MAIN', main.name, main.id)
console.log('old', old?.name, old?.id)

// Touch layout on MAIN to bump updated_at
const themeId = main.id.split('/').pop()
const layoutRes = await fetch(
  `${REST}/themes/${themeId}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let layout = (await layoutRes.json()).asset.value
const stamp = `<!-- lurvox-cache-bust ${Date.now()} -->`
layout = /lurvox-cache-bust/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, stamp)
  : layout.replace('</head>', `  ${stamp}\n</head>`)
await fetch(`${REST}/themes/${themeId}/assets.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
})
console.log('touched layout', stamp)

// Re-publish MAIN (no-op role set) via REST
const repub = await fetch(`${REST}/themes/${themeId}.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ theme: { id: Number(themeId), role: 'main' } }),
})
console.log('republish', repub.status, (await repub.text()).slice(0, 200))

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    themeName: html.match(/"name":"([^"]+)","id":\d+/)?.[1],
    showTrialPlan: html.includes('showTrialPlan'),
    stabilize: html.includes('lurvox-stabilize-trial'),
    trial: html.includes('data-plan-price="179"'),
  }
}

console.log('\nPolling...')
let clean = 0
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/?edge=${Date.now()}-${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126', 'Cache-Control': 'no-cache' },
    })
  ).text()
  const p = probe(html)
  const ok = !p.showTrialPlan && p.trial && p.themeId === themeId
  if (ok) clean++
  console.log(i, p, ok ? 'OK' : '')
  if (clean >= 3) {
    console.log('\nEdge settled on clean theme')
    process.exit(0)
  }
}
console.log('\nStill mixed after polling')
process.exit(1)
