/**
 * Restyle WELCOME60 strip to LURVOX dark + orange; kill beige force CSS.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function safeJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function gql(query, variables = {}) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(GQL, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ query, variables }),
    })
    const json = await safeJson(res)
    if (json?.data) return json.data
    await new Promise((r) => setTimeout(r, 1200))
  }
  throw new Error('gql failed')
}

const overlayJs = `/*! lurvox-offer-overlay v6 — dark orange theme */
(function () {
  if (window.__lurvoxOfferOverlayV6) return;
  window.__lurvoxOfferOverlayV6 = true;
  if (!/lurvox\\.in|myshopify\\.com/i.test(location.host)) return;

  var beige = document.getElementById('lurvox-offer-beige-force');
  if (beige) beige.remove();
  var old = document.getElementById('lurvox-offer-overlay-css');
  if (old) old.remove();

  function killLegacy() {
    document.querySelectorAll('#lurvox-offer-strip-live, .lurvox-offer-strip').forEach(function (el) {
      var t = el.textContent || '';
      if (/5%\\s*OFF|SAVE5|15%\\s*OFF/i.test(t)) el.remove();
    });
  }
  killLegacy();
  setTimeout(killLegacy, 500);
})();
`

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const targets = themes.themes.nodes.filter((theme) => {
  const id = theme.id.split('/').pop()
  return (
    theme.role === 'MAIN' ||
    ['161389281531', '161390362875', '161391804667', '161375289595'].includes(id)
  )
})

const files = [
  {
    filename: 'sections/lurvox-offer-home.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__lurvox-offer-home.liquid'), 'utf8'),
    },
  },
  {
    filename: 'sections/lurvox-client-login.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__lurvox-client-login.liquid'), 'utf8'),
    },
  },
  {
    filename: 'assets/lurvox-offer-overlay.js',
    body: { type: 'TEXT', value: overlayJs },
  },
]

for (const theme of targets) {
  const result = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: theme.id, files }
  )
  const errors = result.themeFilesUpsert?.userErrors || []
  if (errors.length) console.log('errors', theme.id.split('/').pop(), errors)
  else console.log('ok', theme.id.split('/').pop())

  // Scrub beige force from hide-1month.js if present
  const themeId = theme.id.split('/').pop()
  const got = await safeJson(
    await fetch(
      `${REST}/themes/${themeId}/assets.json?asset[key]=assets/lurvox-hide-1month.js`,
      { headers: { 'X-Shopify-Access-Token': token } }
    )
  )
  let body = got?.asset?.value
  if (body && (/e8d5c4|lurvox-offer-beige-force/i.test(body))) {
    let next = body
      .replace(/#e8d5c4/gi, '#100b08')
      .replace(/background:#e8d5c4!important/gi, 'background:#100b08!important')
    if (!/__lurvoxOfferOverlayV6/.test(next)) next += '\n' + overlayJs
    await fetch(`${REST}/themes/${themeId}/assets.json`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ asset: { key: 'assets/lurvox-hide-1month.js', value: next } }),
    })
    console.log('scrubbed hide', themeId)
  }
  await new Promise((r) => setTimeout(r, 400))
}

const main = targets.find((t) => t.role === 'MAIN')
await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: main.id }
)
console.log('published', main.id.split('/').pop())
