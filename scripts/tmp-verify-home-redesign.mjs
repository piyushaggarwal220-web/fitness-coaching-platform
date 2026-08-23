import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const draftId = 'gid://shopify/OnlineStoreTheme/161176715515'
const mainId = 'gid://shopify/OnlineStoreTheme/161112981755'
const SITE = 'https://www.lurvox.in'

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

const liveHtml = await (await fetch(`${SITE}/?v=${Date.now()}`, {
  headers: { 'Cache-Control': 'no-cache' },
})).text()

const fileQuery = `query ($id: ID!) {
  theme(id: $id) {
    name
    role
    files(filenames: ["templates/index.json", "sections/lurvox-home-redesign.liquid"]) {
      nodes {
        filename
        body { ... on OnlineStoreThemeFileBodyText { content } }
      }
    }
  }
}`

const draft = await gql(fileQuery, { id: draftId })
const main = await gql(fileQuery, { id: mainId })

const draftIndex = draft.theme.files.nodes.find((n) => n.filename === 'templates/index.json')?.body
  ?.content
const draftSection = draft.theme.files.nodes.find(
  (n) => n.filename === 'sections/lurvox-home-redesign.liquid'
)?.body?.content
const mainIndex = main.theme.files.nodes.find((n) => n.filename === 'templates/index.json')?.body
  ?.content

const result = {
  liveHtmlHasRedesign: /data-lx-home|lx-home__brand/.test(liveHtml),
  liveHtmlHasOldGallery: /ai_gen_block_52353f6/.test(liveHtml),
  draftRole: draft.theme.role,
  draftIndexHasRedesign: /lurvox-home-redesign/.test(draftIndex || ''),
  draftSectionPresent: /Athletic Editorial|lx-home__brand/.test(draftSection || ''),
  mainRole: main.theme.role,
  mainIndexHasOld: /ai_gen_block_52353f6|blocks_C9E4qf/.test(mainIndex || ''),
  mainIndexHasRedesign: /lurvox-home-redesign/.test(mainIndex || ''),
  previewUrl: `${SITE}/?preview_theme_id=161176715515`,
}

const ok =
  !result.liveHtmlHasRedesign &&
  result.liveHtmlHasOldGallery &&
  result.draftRole === 'UNPUBLISHED' &&
  result.draftIndexHasRedesign &&
  result.draftSectionPresent &&
  result.mainRole === 'MAIN' &&
  result.mainIndexHasOld &&
  !result.mainIndexHasRedesign

console.log(JSON.stringify({ ok, ...result }, null, 2))
if (!ok) process.exit(1)
