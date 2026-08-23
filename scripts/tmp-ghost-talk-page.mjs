import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
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

const pages = await gql(`{
  pages(first: 50, query: "talk OR contact OR coach") {
    nodes { id handle title templateSuffix }
  }
}`)
console.log('matching pages', pages.pages.nodes)

const redirects = await gql(`{
  urlRedirects(first: 20, query: "path:talk*") {
    nodes { id path target }
  }
}`)
console.log('redirects', redirects.urlRedirects.nodes)

const res = await fetch('https://www.lurvox.in/pages/talk-to-a-coach?t=' + Date.now(), {
  redirect: 'manual',
})
console.log('manual redirect status', res.status, [...res.headers.entries()].filter(([k]) =>
  ['location', 'x-', 'cf-', 'cache'].some((p) => k.startsWith(p) || k === 'location' || k.includes('cache'))
))
const html = await res.text()
console.log({
  len: html.length,
  template: html.match(/data-template="([^"]+)"/)?.[1],
  title: html.match(/<title>([^<]+)/)?.[1]?.trim(),
  pageId: html.match(/Shopify\.analytics[\s\S]*?pageId:\s*"?(\d+)/)?.[1],
})
