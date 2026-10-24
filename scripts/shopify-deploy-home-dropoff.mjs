/**
 * Put the homepage dropoff recorder on the live main theme.
 * The old installer targeted theme 12dfr and IDs the current homepage does not have.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOP = '9uwyq1-0j.myshopify.com'
const REST = `https://${SHOP}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const MARKER = 'lurvox-dropoff'

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

loadEnvLocal()
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
if (!supabaseUrl || !anonKey) throw new Error('Supabase public URL or anon key missing')

const tokenFile = fs.existsSync(tokenPath) ? JSON.parse(fs.readFileSync(tokenPath, 'utf8')) : {}
const headers = {
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN || tokenFile.access_token || '',
  'Content-Type': 'application/json',
}

async function refreshUserToken() {
  if (!tokenFile.refresh_token) return false
  const refresh = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokenFile.refresh_token,
    }),
  })
  if (!refresh.ok) return false
  Object.assign(tokenFile, await refresh.json())
  fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
  headers['X-Shopify-Access-Token'] = tokenFile.access_token
  return true
}

async function mintClientCredentials() {
  if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) return false
  const minted = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  })
  const mintedJson = await minted.json().catch(() => ({}))
  if (!minted.ok || !mintedJson.access_token) return false
  headers['X-Shopify-Access-Token'] = mintedJson.access_token
  return true
}

async function themesJson() {
  return fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': headers['X-Shopify-Access-Token'] } })
}

let themeRes = await themesJson()
if (themeRes.status === 401 && (await refreshUserToken())) themeRes = await themesJson()
if (themeRes.status === 401 && (await mintClientCredentials())) themeRes = await themesJson()
const themeJson = await themeRes.json()
if (!themeRes.ok || !Array.isArray(themeJson.themes)) throw new Error(`themes.json ${themeRes.status}`)
const main = themeJson.themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

const snippet = `{%- comment -%} ${MARKER} {%- endcomment -%}
<script>
(function () {
  if (location.pathname !== '/' && location.pathname !== '') return;
  var parts = [
    [['MainContent', 'lurvox-offer-strip-home', 'top'], 'hero', 0, 'Hero'],
    [['what-you-get', 'system'], 'system', 2, 'What you get'],
    [['plans', 'pricing'], 'pricing', 5, 'Plans'],
    [['start'], 'close', 7, 'Closing offer']
  ];
  var sent = {};
  function sid() {
    var key = 'lx_drop';
    var value = sessionStorage.getItem(key);
    if (!value) {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      value = Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      sessionStorage.setItem(key, value);
    }
    return value;
  }
  function source() {
    var key = 'lx_drop_source';
    var saved = sessionStorage.getItem(key);
    if (saved) return saved;
    var ad = /[?&](fbclid|utm_)/.test(location.search) ? 'ad' : 'other';
    sessionStorage.setItem(key, ad);
    return ad;
  }
  function record(part) {
    if (sent[part[1]]) return;
    sent[part[1]] = true;
    fetch(${JSON.stringify(supabaseUrl + '/rest/v1/landing_dropoff')}, {
      method: 'POST',
      headers: {
        apikey: ${JSON.stringify(anonKey)},
        Authorization: ${JSON.stringify('Bearer ' + anonKey)},
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        session_id: sid(),
        section_key: part[1],
        section_index: part[2],
        section_label: part[3],
        source: source(),
        path: '/'
      })
    }).catch(function () {});
  }
  function boot() {
    var nodes = parts.map(function (part) {
      var el = null;
      for (var i = 0; i < part[0].length; i++) {
        el = document.getElementById(part[0][i]);
        if (el) break;
      }
      return [el, part];
    }).filter(function (row) { return row[0]; });
    if (!nodes.length || !('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var match = nodes.find(function (row) { return row[0] === entry.target; });
        if (match) record(match[1]);
      });
    }, { threshold: 0, rootMargin: '0px 0px -25% 0px' });
    nodes.forEach(function (row) { observer.observe(row[0]); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>
{%- comment -%} /${MARKER} {%- endcomment -%}
`

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': headers['X-Shopify-Access-Token'] } }
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

let layout = await get('layout/theme.liquid')
const start = `{%- comment -%} ${MARKER} {%- endcomment -%}`
const end = `{%- comment -%} /${MARKER} {%- endcomment -%}`
const startAt = layout.indexOf(start)
const endAt = layout.indexOf(end)
if (startAt >= 0 && endAt > startAt) {
  layout = layout.slice(0, startAt) + snippet + layout.slice(endAt + end.length)
} else if (!layout.includes('</body>')) {
  throw new Error('</body> not found')
} else {
  layout = layout.replace('</body>', `${snippet}\n</body>`)
}
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)

const res = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files: [{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } }],
    },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
}
console.log('upserted', json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename))
console.log('home', `https://www.lurvox.in/?v=${stamp}`)
console.log('has marker', layout.includes(MARKER))
