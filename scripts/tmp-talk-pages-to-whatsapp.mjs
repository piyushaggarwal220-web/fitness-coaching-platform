/**
 * Force Talk-to-a-coach pages + CTAs onto WhatsApp.
 * Pages override URL redirects, so replace page bodies with an instant WA redirect.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const WA =
  'https://wa.me/919220451577?text=' +
  encodeURIComponent('i want a free consultation call and more info')

const REDIRECT_BODY = `<!-- lurvox-talk-wa-redirect:${Date.now()} -->
<meta http-equiv="refresh" content="0;url=${WA}">
<script>window.location.replace(${JSON.stringify(WA)});</script>
<p style="font-family:system-ui;padding:24px;text-align:center;">
  Opening WhatsApp…<br/>
  <a href="${WA}">Tap here if it doesn’t open</a>
</p>`

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const pages = (await (await fetch(`${REST}/pages.json?limit=250`, { headers })).json()).pages
const talkPages = pages.filter((p) => /talk/i.test(p.handle) || /talk/i.test(p.title))
console.log(
  'talk pages',
  talkPages.map((p) => ({ id: p.id, handle: p.handle, title: p.title, published: !!p.published_at }))
)

for (const p of talkPages) {
  const put = await fetch(`${REST}/pages/${p.id}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      page: {
        id: p.id,
        body_html: REDIRECT_BODY,
        published: true,
      },
    }),
  })
  console.log('update page', p.handle, put.status)
}

// Also patch header actions via GraphQL if custom liquid / login section can carry script
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

async function get(key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset?.value
}
async function put(key, value) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  return { status: res.status, ...(await res.json().catch(() => ({}))) }
}

// Inject global force script into lurvox-hide-1month section (already on many templates)
const HIDE_KEY = 'sections/lurvox-hide-1month.liquid'
let hide = await get(HIDE_KEY)
if (hide) {
  hide = hide.replace(
    /\{%-?\s*comment\s*-?%\} lurvox-talk-wa-force-v1[\s\S]*?\{%-?\s*comment\s*-?%\} \/lurvox-talk-wa-force-v1[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,
    ''
  )
  hide += `
{% comment %} lurvox-talk-wa-force-v1 {% endcomment %}
<script>
(function(){
  var WA=${JSON.stringify(WA)};
  function force(){
    document.querySelectorAll('a').forEach(function(a){
      var href=a.getAttribute('href')||'';
      var label=(a.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();
      if(/talk-to-a-coach|talk-coach/.test(href) || label==='talk to a coach' || label==='talk to coach'){
        a.setAttribute('href', WA);
        a.setAttribute('target','_blank');
        a.setAttribute('rel','noopener noreferrer');
      }
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', force);
  else force();
  setTimeout(force, 300);
  setTimeout(force, 1200);
})();
</script>
{% comment %} /lurvox-talk-wa-force-v1 {% endcomment %}
`
  console.log('put hide section', await put(HIDE_KEY, hide))
  await gql(
    `mutation($themeId:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){
      themeFilesUpsert(themeId:$themeId,files:$files){
        upsertedThemeFiles{filename}
        userErrors{message}
      }
    }`,
    {
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files: [{ filename: HIDE_KEY, body: { type: 'TEXT', value: hide } }],
    }
  )
}

// Verify pages redirect client-side content
for (const handle of ['talk-coach', 'talk-to-a-coach']) {
  const html = await fetch(`https://www.lurvox.in/pages/${handle}?cb=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  console.log(handle, {
    hasWa: html.includes('wa.me/919220451577'),
    hasMsg: html.includes('free%20consultation') || html.includes('free consultation'),
    hasStamp: html.includes('lurvox-talk-wa-redirect'),
    hasReplace: html.includes('location.replace'),
  })
}

// Check view= home for script if hide section renders
const view = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
console.log('view has talk-wa force', view.includes('lurvox-talk-wa-force-v1'))
console.log('view has hide style', view.includes('lurvox-hide-1month-style'))
