import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const THEME_ID = 187792523515
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
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
  'X-Shopify-Access-Token': tokenFile.access_token || '',
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

const snippet = `{%- comment -%} ${MARKER} {%- endcomment -%}
<script>
(function () {
  if (location.pathname !== '/') return;
  var parts = [
    ['top', 'hero', 0, 'Hero'],
    ['why', 'why', 1, "Why you won't fail"],
    ['system', 'system', 2, 'What you get'],
    ['coaching', 'coaching', 3, 'Coaches'],
    ['method', 'method', 4, 'How it works'],
    ['pricing', 'pricing', 5, 'Plans'],
    ['faq', 'faq', 6, 'Questions']
  ];
  var closeEl = document.querySelector('.lx-final');
  if (closeEl) parts.push([closeEl, 'close', 7, 'Closing offer']);
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
  var nodes = parts.map(function (part) {
    return [typeof part[0] === 'string' ? document.getElementById(part[0]) : part[0], part];
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
})();
</script>
{%- comment -%} /${MARKER} {%- endcomment -%}
`

let themeResponse = await fetch(`${API}/themes.json`, { headers })
if (themeResponse.status === 401) {
  if (!(await refreshUserToken())) throw new Error('Shopify refresh failed')
  themeResponse = await fetch(`${API}/themes.json`, { headers })
}
const themes = await themeResponse.json()
if (!themeResponse.ok) throw new Error(`themes ${themeResponse.status}`)
const theme = (themes.themes || []).find((item) => Number(item.id) === THEME_ID)
if (!theme || theme.role !== 'main' || theme.name !== '12dfr') {
  throw new Error(`Refusing to write theme ${theme?.id} ${theme?.name} ${theme?.role}`)
}

const layoutRes = await fetch(
  `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers }
)
const layoutJson = await layoutRes.json()
let layout = layoutJson.asset?.value
if (!layout) throw new Error('theme.liquid missing')
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

const put = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
})
if (!put.ok) throw new Error(`theme write ${put.status} ${(await put.text()).slice(0, 240)}`)
console.log('dropoff recorder written')
