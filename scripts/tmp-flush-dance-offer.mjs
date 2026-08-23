/**
 * Last-ditch cache flush: rename theme + republish dance + probe.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

function probe(html, headers) {
  const st = headers.get('server-timing') || ''
  return {
    stTheme: st.match(/theme;desc="(\d+)"/)?.[1],
    shopifyTheme: html.match(/"id":(\d+),"schema_name"/)?.[1],
    cdnT: html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1],
    offer: /lurvox-offer-strip|SAVE5|SALE ENDS IN/.test(html),
    offerHome: html.includes('lurvox-offer-home') || html.includes('lurvox-offer-strip-home'),
    price: html.includes('Price increases in'),
    oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
    choose: /Choose your plan/i.test(html),
  }
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const temp = themes.themes.nodes.find((t) => t.id.includes('161251328251')) // t/20
console.log('MAIN', main.name, main.id)
console.log('TEMP', temp?.name, temp?.id)

const newName = `Offer live ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
const renamed = await fetch(`${REST}/themes/${main.id.split('/').pop()}.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({
    theme: { id: Number(main.id.split('/').pop()), name: newName },
  }),
}).then((r) => r.json())
console.log('renamed', renamed.theme?.name)

if (temp) {
  console.log('publish temp...')
  console.log(
    JSON.stringify(
      await gql(
        `mutation($id:ID!){ themePublish(id:$id){ theme{name role} userErrors{message}}}`,
        { id: temp.id }
      )
    )
  )
  await new Promise((r) => setTimeout(r, 5000))
  console.log('publish MAIN back...')
  console.log(
    JSON.stringify(
      await gql(
        `mutation($id:ID!){ themePublish(id:$id){ theme{name role} userErrors{message}}}`,
        { id: main.id }
      )
    )
  )
}

for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const r = await fetch(`https://www.lurvox.in/index?cb=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' },
  })
  const html = await r.text()
  const p = probe(html, r.headers)
  console.log(i, p)
  if (p.offer && !p.oldLogin && p.cdnT !== '21') {
    console.log('CACHE CLEARED')
    process.exit(0)
  }
}
process.exit(1)
