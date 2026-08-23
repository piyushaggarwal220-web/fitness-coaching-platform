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
  await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const gql = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: `mutation($themeId:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){
        themeFilesUpsert(themeId:$themeId,files:$files){
          upsertedThemeFiles{filename} userErrors{message}
        }
      }`,
      variables: {
        themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
        files: [{ filename: key, body: { type: 'TEXT', value } }],
      },
    }),
  }).then((r) => r.json())
  return gql.data?.themeFilesUpsert || gql.errors
}

const keys = [
  'sections/mobile-floating-bar.liquid',
  'layout/theme.liquid',
  'sections/lurvox-hide-1month.liquid',
  'blocks/lurvox-hide-1month.liquid',
]

for (const key of keys) {
  const v = await get(key)
  if (!v) {
    console.log(key, 'missing')
    continue
  }
  const hasOld = v.includes("'/pages/talk-coach'") || v.includes('/pages/talk-coach')
  const hasTalk = /talk-coach|talk-to-a-coach/.test(v)
  console.log(key, { len: v.length, hasOld, hasTalk })
}

let fab = await get('sections/mobile-floating-bar.liquid')
// Strip old talk-coach force redirects and inject WA force
fab = fab
  .replace(/\{%-?\s*comment\s*-?%\} lurvox-talk-wa-force-v1[\s\S]*?\/lurvox-talk-wa-force-v1[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
  .replace(/if \(path === '\/pages\/talk-to-a-coach'\)[\s\S]*?window\.location\.replace\('\/pages\/talk-coach'[\s\S]*?;\s*\}/g, '')
  .replace(/assign consult_url = '\/pages\/talk-[^']+'/g, `assign consult_url = '${WA}'`)

if (!fab.includes('lurvox-talk-wa-force-v2')) {
  fab += `
{%- comment -%} lurvox-talk-wa-force-v2 {%- endcomment -%}
<script>
(function(){
  var WA=${JSON.stringify(WA)};
  function force(){
    document.querySelectorAll('a').forEach(function(a){
      var href=a.getAttribute('href')||'';
      var label=(a.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();
      if(/talk-to-a-coach|talk-coach|talk-coach-consult/.test(href) || label==='talk to a coach' || label==='talk to coach'){
        a.setAttribute('href', WA);
        a.setAttribute('target','_blank');
        a.setAttribute('rel','noopener noreferrer');
      }
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', force);
  else force();
  setTimeout(force, 200);
  setTimeout(force, 1000);
})();
</script>
{%- comment -%} /lurvox-talk-wa-force-v2 {%- endcomment -%}
`
}

// Also hardcode primary FAB href to WA regardless of settings
fab = fab.replace(
  /href="\{\{\s*consult_url\s*\}\}"/,
  `href="${WA}" target="_blank" rel="noopener noreferrer"`
)

console.log('fab upsert', await put('sections/mobile-floating-bar.liquid', fab))

// Update talk section liquid to redirect immediately
const talkKey = 'sections/lurvox-talk-to-coach.liquid'
let talk = await get(talkKey)
if (talk) {
  if (!talk.includes('lurvox-talk-section-wa-redirect')) {
    talk =
      `{% comment %} lurvox-talk-section-wa-redirect {% endcomment %}
<script>window.location.replace(${JSON.stringify(WA)});</script>
<meta http-equiv="refresh" content="0;url=${WA}">
` + talk
  }
  console.log('talk section upsert', await put(talkKey, talk))
} else {
  console.log('talk section missing on theme')
}

// Verify section API
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 2500))
  const sec = await fetch(
    `https://www.lurvox.in/?sections=mobile-floating-bar&cb=${Date.now()}-${i}`
  ).then((r) => r.json())
  const html = sec['mobile-floating-bar'] || ''
  console.log(i, {
    v2: html.includes('lurvox-talk-wa-force-v2'),
    waHref: html.includes('text=i%20want%20a%20free%20consultation'),
    len: html.length,
  })
  if (html.includes('lurvox-talk-wa-force-v2') || html.includes('text=i%20want%20a%20free')) {
    console.log('FAB SECTION UPDATED')
    break
  }
}
