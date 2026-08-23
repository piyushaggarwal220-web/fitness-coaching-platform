import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'

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

const page = await gql(`{
  page(id: "gid://shopify/Page/134114214139") {
    id handle templateSuffix updatedAt
  }
}`)
console.log('admin page', page.page)

const urls = [
  'https://www.lurvox.in/pages/consistency-league?view=consistency-league&v=' + Date.now(),
  'https://www.lurvox.in/pages/consistency-league?view=league&v=' + Date.now(),
  'https://9uwyq1-0j.myshopify.com/pages/consistency-league?view=consistency-league&v=' +
    Date.now(),
]

for (const url of urls) {
  const res = await fetch(url, {
    redirect: 'manual',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      Cookie: '',
    },
  })
  const loc = res.headers.get('location')
  let html = ''
  if (res.status >= 300 && res.status < 400 && loc) {
    const res2 = await fetch(new URL(loc, url), {
      headers: { 'Cache-Control': 'no-cache' },
    })
    html = await res2.text()
    console.log({
      from: url,
      redirect: loc,
      final: res2.url,
      status: res2.status,
      dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
      hasBack: html.includes('lx-league__back'),
      sectionIds: [...html.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]),
    })
  } else {
    html = await res.text()
    console.log({
      from: url,
      status: res.status,
      headers: {
        'x-shopid': res.headers.get('x-shopid'),
        'x-sorting-hat-shopid': res.headers.get('x-sorting-hat-shopid'),
        'x-shardid': res.headers.get('x-shardid'),
        server: res.headers.get('server'),
        via: res.headers.get('via'),
        age: res.headers.get('age'),
        'cf-cache-status': res.headers.get('cf-cache-status'),
        'x-cache': res.headers.get('x-cache'),
      },
      dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
      hasBack: html.includes('lx-league__back'),
      sectionIds: [...html.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]),
      heroHasBack: html.includes('lx-league__back'),
    })
  }
}

// Check shop primary domain
const shop = await gql(`{
  shop {
    id
    name
    primaryDomain { host url }
    myshopifyDomain
  }
}`)
console.log('shop', shop.shop)
