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

// Ensure a clean working page exists
const existing = await gql(`{
  pages(first: 20, query: "handle:talk-coach OR handle:talk-to-a-coach") {
    nodes { id handle title templateSuffix }
  }
}`)
console.log('pages', existing.pages.nodes)

let working = existing.pages.nodes.find((p) => p.handle === 'talk-coach')
if (!working) {
  const create = await gql(
    `mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      page: {
        title: 'Talk to a coach',
        handle: 'talk-coach',
        templateSuffix: 'talk-to-a-coach',
        body: '',
        isPublished: true,
      },
    }
  )
  console.log('create talk-coach', create.pageCreate)
  working = create.pageCreate.page
}

// Create redirect from old handle path to working handle
const redirect = await gql(
  `mutation urlRedirectCreate($urlRedirect: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $urlRedirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }`,
  {
    urlRedirect: {
      path: '/pages/talk-to-a-coach',
      target: '/pages/talk-coach',
    },
  }
)
console.log('redirect', JSON.stringify(redirect.urlRedirectCreate, null, 2))

await new Promise((r) => setTimeout(r, 3000))

for (const url of [
  'https://www.lurvox.in/pages/talk-coach',
  'https://www.lurvox.in/pages/talk-to-a-coach',
]) {
  const res = await fetch(url + '?t=' + Date.now(), { redirect: 'follow' })
  const html = await res.text()
  console.log(url, {
    final: res.url,
    status: res.status,
    form: html.includes('lurvox-talk-coach__form'),
    api: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
    template: html.match(/data-template="([^"]+)"/)?.[1],
  })
}
