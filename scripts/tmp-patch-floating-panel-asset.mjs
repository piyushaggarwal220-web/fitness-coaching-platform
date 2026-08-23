import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

const KEY = 'assets/floating-panel.js'
const MARKER = '/* lurvox-hide-1month-asset-v1 */'

async function getAsset() {
  return (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset
}

let asset = await getAsset()
let js = asset.value || ''
console.log('asset bytes', js.length, 'updated', asset.updated_at)
console.log('has marker', js.includes(MARKER))

// Strip previous injections
js = js.replace(/\/\* lurvox-hide-1month-asset-v1 \*\/[\s\S]*?\/\* \/lurvox-hide-1month-asset-v1 \*\//g, '')

const INJECT = `
${MARKER}
(function(){
  function hideOneMonthAndFixPlans(){
    try {
      document.querySelectorAll('[data-plan-index="1"]').forEach(function(el){
        el.style.setProperty('display','none','important');
        el.setAttribute('hidden','true');
        el.setAttribute('aria-hidden','true');
      });
      document.querySelectorAll('[class*="plan-card-duration"]').forEach(function(el){
        var t=(el.textContent||'').replace(/\\s+/g,' ').trim();
        if(/^1\\s*Months?$/i.test(t)){
          var n=el;
          for(var i=0;i<10 && n;i++){
            if(n.querySelector && n.querySelector('[class*="plan-card-price"]') && n.querySelector('[class*="plan-card-duration"]')){
              n.style.setProperty('display','none','important');
              n.setAttribute('hidden','true');
              break;
            }
            n=n.parentElement;
          }
        }
      });
      // Plans page RTE: hide list items / links mentioning 1 Month + 499
      document.querySelectorAll('li, p, a, div').forEach(function(el){
        if(el.children && el.children.length>3) return;
        var t=(el.textContent||'').replace(/\\s+/g,' ').trim();
        if(/^1\\s*Month\\s*[—\\-–].*499/i.test(t) || /^1\\s*Month\\s*—\\s*₹?499/i.test(t)){
          el.style.setProperty('display','none','important');
        }
      });
      document.querySelectorAll('a[href*="plan=1_month"],a[href*="plans/1-month"]').forEach(function(a){
        a.setAttribute('href','https://app.lurvox.in/checkout?plan=3_months');
      });
    } catch(e) {}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', hideOneMonthAndFixPlans);
  else hideOneMonthAndFixPlans();
  setTimeout(hideOneMonthAndFixPlans, 200);
  setTimeout(hideOneMonthAndFixPlans, 800);
  setTimeout(hideOneMonthAndFixPlans, 2000);
})();
/* /lurvox-hide-1month-asset-v1 */
`

js = js.trimEnd() + '\n' + INJECT + '\n'

const put = await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: KEY, value: js } }),
})
console.log('REST put', put.status)

const gql = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files: [{ filename: KEY, body: { type: 'TEXT', value: js } }],
    },
  }),
}).then((r) => r.json())
console.log('GQL', JSON.stringify(gql.data?.themeFilesUpsert || gql.errors))

asset = await getAsset()
console.log('after marker', asset.value.includes(MARKER), 'updated', asset.updated_at)

// Fetch the exact URL the stale homepage references
const staleHtml = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
const m = staleHtml.match(/\/\/www\.lurvox\.in\/cdn\/shop\/t\/12\/assets\/floating-panel\.js\?v=[0-9]+/)
console.log('stale html ref', m?.[0])

if (m) {
  const url = 'https:' + m[0]
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 2500))
    const body = await fetch(url + '&r=' + Date.now(), {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    }).then((r) => r.text())
    const noQuery = await fetch(
      'https://www.lurvox.in/cdn/shop/t/12/assets/floating-panel.js?r=' + Date.now(),
      { headers: { 'Cache-Control': 'no-cache' } }
    ).then((r) => r.text())
    console.log(i, {
      exactV: body.includes(MARKER),
      exactLen: body.length,
      noV: noQuery.includes(MARKER),
      noVLen: noQuery.length,
    })
    if (body.includes(MARKER) || noQuery.includes(MARKER)) {
      console.log('CDN ASSET UPDATED')
      break
    }
  }
}
