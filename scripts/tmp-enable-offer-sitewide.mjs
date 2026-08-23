/**
 * Enable beige WELCOME60 offer strip sitewide + purge 5% OFF injectors.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(ROOT, 'tmp-live-main')
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

// Enable header offer strip on all pages
const headerPath = path.join(DIR, 'sections__header-group.json')
const header = JSON.parse(fs.readFileSync(headerPath, 'utf8'))
if (header.sections?.lurvox_client_login?.settings) {
  header.sections.lurvox_client_login.settings.enabled = true
  header.sections.lurvox_client_login.settings.homepage_only = false
  header.sections.lurvox_client_login.settings.code = 'WELCOME60'
  fs.writeFileSync(headerPath, JSON.stringify(header, null, 2) + '\n')
}

const beigeForce = `/*! lurvox-offer-overlay v5 */
(function () {
  if (window.__lurvoxOfferOverlayV5) return;
  window.__lurvoxOfferOverlayV5 = true;
  if (!/lurvox\\.in|myshopify\\.com/i.test(location.host)) return;

  var oldCss = document.getElementById('lurvox-offer-overlay-css');
  if (oldCss) oldCss.remove();

  function killLegacyStrips() {
    document.querySelectorAll('#lurvox-offer-strip-live, .lurvox-offer-strip').forEach(function (el) {
      var t = (el.textContent || '');
      if (/5%\\s*OFF|SAVE5|15%\\s*OFF/i.test(t)) el.remove();
    });
  }

  if (!document.getElementById('lurvox-offer-beige-force')) {
    var style = document.createElement('style');
    style.id = 'lurvox-offer-beige-force';
    style.textContent = [
      '#lurvox-offer-strip-live,.lurvox-offer-strip{color:#1a1a1a!important;background:#e8d5c4!important;background-image:none!important;border-bottom:1px solid rgba(0,0,0,.06)!important}',
      '#lurvox-offer-strip-live a,.lurvox-offer-strip__inner{color:#1a1a1a!important}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  killLegacyStrips();
  setTimeout(killLegacyStrips, 400);
  setTimeout(killLegacyStrips, 1200);
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
    filename: 'sections/header-group.json',
    body: { type: 'TEXT', value: fs.readFileSync(headerPath, 'utf8') },
  },
  {
    filename: 'sections/lurvox-client-login.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__lurvox-client-login.liquid'), 'utf8'),
    },
  },
  {
    filename: 'sections/lurvox-offer-home.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__lurvox-offer-home.liquid'), 'utf8'),
    },
  },
  {
    filename: 'assets/lurvox-offer-overlay.js',
    body: { type: 'TEXT', value: beigeForce },
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
  if (errors.length) console.log('errors', theme.id, errors)
  else console.log('ok', theme.id.split('/').pop())

  // Also patch hide-1month.js: strip ensureOffer / 5% OFF
  const themeId = theme.id.split('/').pop()
  const got = await safeJson(
    await fetch(
      `${REST}/themes/${themeId}/assets.json?asset[key]=assets/lurvox-hide-1month.js`,
      { headers: { 'X-Shopify-Access-Token': token } }
    )
  )
  let body = got?.asset?.value
  if (body && (/5% OFF|SAVE5|ensureOffer/i.test(body))) {
    let next = body
      .replace(/function ensureOffer\(\)\s*\{[\s\S]*?\n  \}/g, 'function ensureOffer(){ /* disabled */ }')
      .replace(/5% OFF coaching plans/g, 'WELCOME60 for 60% OFF ENDS SOON')
      .replace(/SAVE5/g, 'WELCOME60')
    if (!/__lurvoxOfferOverlayV5/.test(next)) next += '\n' + beigeForce
    await fetch(`${REST}/themes/${themeId}/assets.json`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ asset: { key: 'assets/lurvox-hide-1month.js', value: next } }),
    })
    console.log('patched hide', themeId)
  }
  await new Promise((r) => setTimeout(r, 500))
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
