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

let layout = await get('layout/theme.liquid')
const idx = layout.indexOf('talk-coach')
console.log('context around talk-coach:\n', layout.slice(Math.max(0, idx - 400), idx + 600))

// Replace any redirect-to-talk-coach logic with WhatsApp
const before = layout
layout = layout.replace(
  /window\.location\.replace\(\s*['"]\/pages\/talk-coach['"][^)]*\)/g,
  `window.location.replace(${JSON.stringify(WA)})`
)
layout = layout.replace(
  /href\s*=\s*['"]\/pages\/talk-coach['"]/g,
  `href=${JSON.stringify(WA)} target="_blank" rel="noopener noreferrer"`
)
layout = layout.replace(
  /href\s*=\s*['"]\/pages\/talk-to-a-coach['"]/g,
  `href=${JSON.stringify(WA)} target="_blank" rel="noopener noreferrer"`
)

// If there's a path check redirecting talk-to-a-coach -> talk-coach, rewrite to WA
layout = layout.replace(
  /if\s*\(\s*path\s*===\s*['"]\/pages\/talk-to-a-coach['"]\s*\)\s*\{[\s\S]*?\}/g,
  `if (path === '/pages/talk-to-a-coach' || path === '/pages/talk-coach') { window.location.replace(${JSON.stringify(WA)}); }`
)

if (!layout.includes('lurvox-layout-talk-wa-v1')) {
  layout = layout.replace(
    '</body>',
    `<script>
/* lurvox-layout-talk-wa-v1 */
(function(){
  var WA=${JSON.stringify(WA)};
  function force(){
    document.querySelectorAll('a').forEach(function(a){
      var href=a.getAttribute('href')||'';
      var label=(a.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();
      if(/talk-to-a-coach|\\/pages\\/talk-coach/.test(href) || label==='talk to a coach' || label==='talk to coach'){
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
</body>`
  )
}

console.log('changed', before !== layout, 'delta', layout.length - before.length)

const put = await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
})
console.log('REST put', put.status)

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
      files: [{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } }],
    },
  }),
}).then((r) => r.json())
console.log('GQL', JSON.stringify(gql.data?.themeFilesUpsert || gql.errors))

const verify = await get('layout/theme.liquid')
console.log('saved has v1', verify.includes('lurvox-layout-talk-wa-v1'))
console.log('saved has consult text', verify.includes('free%20consultation') || verify.includes('free consultation'))
