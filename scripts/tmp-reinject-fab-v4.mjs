import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

const KEY = 'sections/mobile-floating-bar.liquid'
const asset = (
  await (
    await fetch(
      `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
      { headers }
    )
  ).json()
).asset
console.log('fab asset', {
  updated: asset.updated_at,
  len: asset.value?.length,
  hasV3: asset.value?.includes('fab-v3'),
  hasHide: asset.value?.includes('lurvox-hide-1month-style'),
})

const MARKER_START = '{%- comment -%} lurvox-hide-1month-fab-v4 {%- endcomment -%}'
const MARKER_END = '{%- comment -%} /lurvox-hide-1month-fab-v4 {%- endcomment -%}'
const SNIPPET = `
${MARKER_START}
<style id="lurvox-hide-1month-style">
[data-plan-index="1"]{display:none!important}
</style>
<script>
(function(){
  function hide(){
    document.querySelectorAll('[data-plan-index="1"]').forEach(function(el){
      el.style.setProperty('display','none','important');
      el.setAttribute('hidden','true');
    });
    document.querySelectorAll('[class*="plan-card-duration"]').forEach(function(el){
      var t=(el.textContent||'').replace(/\\s+/g,' ').trim();
      if(/^1\\s*Months?$/i.test(t)){
        var n=el;
        for(var i=0;i<10&&n;i++){
          if(n.querySelector&&n.querySelector('[class*="plan-card-price"]')&&n.querySelector('[class*="plan-card-duration"]')){
            n.style.setProperty('display','none','important');
            break;
          }
          n=n.parentElement;
        }
      }
    });
    document.querySelectorAll('li,p,a').forEach(function(el){
      if(el.children&&el.children.length>2) return;
      var t=(el.textContent||'').replace(/\\s+/g,' ').trim();
      if(/^1\\s*Month\\s*[—\\-–].{0,20}499/i.test(t)) el.style.setProperty('display','none','important');
    });
    document.querySelectorAll('a[href*="plan=1_month"],a[href*="plans/1-month"]').forEach(function(a){
      a.setAttribute('href','${APP}/checkout?plan=3_months');
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',hide); else hide();
  setTimeout(hide,200); setTimeout(hide,1000); setTimeout(hide,2500);
})();
</script>
<div hidden data-lurvox-hide-1month="fab-v4"></div>
${MARKER_END}
`

let fab = asset.value || ''
fab = fab.replace(
  /\{%- comment -%\} lurvox-hide-1month-fab-v[0-9]+[\s\S]*?\{%- comment -%\} \/lurvox-hide-1month-fab-v[0-9]+ \{%- endcomment -%\}/g,
  ''
)
fab = fab.trimEnd() + '\n' + SNIPPET + '\n'

await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: KEY, value: fab } }),
})

const gql = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation($themeId:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){
      themeFilesUpsert(themeId:$themeId,files:$files){
        upsertedThemeFiles{filename}
        userErrors{message}
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files: [{ filename: KEY, body: { type: 'TEXT', value: fab } }],
    },
  }),
}).then((r) => r.json())
console.log('upsert', JSON.stringify(gql.data?.themeFilesUpsert || gql.errors))

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const sec = await fetch(
    `https://www.lurvox.in/?sections=mobile-floating-bar&cb=${Date.now()}-${i}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } }
  ).then((r) => r.json())
  const html = sec['mobile-floating-bar'] || ''
  const view = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).then((r) => r.text())
  console.log(i, {
    apiHide: html.includes('lurvox-hide-1month-style'),
    apiV4: html.includes('fab-v4'),
    apiLen: html.length,
    viewHide: view.includes('lurvox-hide-1month-style'),
    viewDurations: [...view.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)]
      .map((m) => m[1].trim())
      .filter(Boolean),
  })
  if (html.includes('fab-v4')) {
    console.log('SECTION API HAS V4')
    break
  }
}
