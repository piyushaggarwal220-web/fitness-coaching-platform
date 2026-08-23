/**
 * Point all "Talk to a coach" CTAs to WhatsApp with a prefilled consultation message.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `https://${STORE}/admin/api/2025-01/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const WA =
  'https://wa.me/919220451577?text=' +
  encodeURIComponent('i want a free consultation call and more info')

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

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

async function getAsset(key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset?.value
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  return { status: res.status, updated: json.asset?.updated_at, err: json.errors }
}

async function upsertThemeFile(filename, value) {
  return gql(
    `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files: [{ filename, body: { type: 'TEXT', value } }],
    }
  )
}

// 1) Footer FAB consultation_url
{
  const key = 'sections/footer-group.json'
  const raw = await getAsset(key)
  const cleaned = raw.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
  const footer = JSON.parse(cleaned)
  const fab = footer.sections?.mobile_floating_bar
  if (fab?.settings) {
    fab.settings.consultation_url = WA
    console.log('footer consultation_url ->', fab.settings.consultation_url)
    console.log('put footer', await putAsset(key, JSON.stringify(footer, null, 2)))
    console.log('gql footer', JSON.stringify(await upsertThemeFile(key, JSON.stringify(footer, null, 2))))
  } else {
    console.log('mobile_floating_bar missing in footer-group')
  }
}

// 2) Liquid default for FAB
{
  const key = 'sections/mobile-floating-bar.liquid'
  let liquid = await getAsset(key)
  if (liquid) {
    liquid = liquid.replace(
      /assign consult_url = '\/pages\/talk-to-a-coach'/g,
      `assign consult_url = '${WA}'`
    )
    liquid = liquid.replace(
      /assign consult_url = '\/pages\/talk-coach'/g,
      `assign consult_url = '${WA}'`
    )
    // Force href even if settings still point at talk pages
    if (!liquid.includes('lurvox-talk-wa-force-v1')) {
      liquid = liquid.replace(
        /href="\{\{\s*consult_url\s*\}\}"/,
        `href="{{ consult_url }}" data-lurvox-talk-wa="1"`
      )
      liquid += `
{%- comment -%} lurvox-talk-wa-force-v1 {%- endcomment -%}
<script>
(function(){
  var WA=${JSON.stringify(WA)};
  function forceTalkToWhatsApp(){
    document.querySelectorAll('a[href*="talk-to-a-coach"],a[href*="talk-coach"],a[data-lurvox-talk-wa],a.lurvox-fab__btn--primary').forEach(function(a){
      var href=a.getAttribute('href')||'';
      var label=(a.textContent||'').toLowerCase();
      if(/talk-to-a-coach|talk-coach/.test(href) || /talk\\s*to\\s*a\\s*coach/.test(label) || a.hasAttribute('data-lurvox-talk-wa')){
        a.setAttribute('href', WA);
        a.setAttribute('target','_blank');
        a.setAttribute('rel','noopener noreferrer');
      }
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', forceTalkToWhatsApp);
  else forceTalkToWhatsApp();
  setTimeout(forceTalkToWhatsApp, 400);
  setTimeout(forceTalkToWhatsApp, 1200);
})();
</script>
{%- comment -%} /lurvox-talk-wa-force-v1 {%- endcomment -%}
`
    }
    console.log('put fab liquid', await putAsset(key, liquid))
    console.log('gql fab', JSON.stringify((await upsertThemeFile(key, liquid)).themeFilesUpsert))
  }
}

// 3) Local repo copy
{
  const local = path.join(process.cwd(), 'scripts', 'mobile-floating-bar.liquid')
  if (fs.existsSync(local)) {
    let liquid = fs.readFileSync(local, 'utf8')
    liquid = liquid.replace(
      /assign consult_url = '\/pages\/talk-to-a-coach'/g,
      `assign consult_url = '${WA}'`
    )
    fs.writeFileSync(local, liquid)
    console.log('updated local mobile-floating-bar.liquid default')
  }
}

// 4) Shopify URL redirects — works even when homepage HTML is stale
{
  const redirects = (await (await fetch(`${REST}/redirects.json?limit=250`, { headers })).json())
    .redirects
  const targets = ['/pages/talk-to-a-coach', '/pages/talk-coach', '/pages/talk-coach-consult']
  for (const p of targets) {
    const existing = redirects.find((r) => r.path === p)
    if (existing) {
      const put = await fetch(`${REST}/redirects/${existing.id}.json`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ redirect: { id: existing.id, path: p, target: WA } }),
      })
      console.log('update redirect', p, put.status, '->', WA.slice(0, 60))
    } else {
      const create = await fetch(`${REST}/redirects.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ redirect: { path: p, target: WA } }),
      })
      const body = await create.json()
      console.log('create redirect', p, create.status, body.redirect?.id || body.errors)
    }
  }
}

// 5) Update navigation menus that point at talk pages
{
  const menus = await gql(`{
    menus(first: 20) {
      nodes {
        id
        handle
        title
        items {
          id
          title
          url
          type
          resourceId
          items {
            id
            title
            url
            type
          }
        }
      }
    }
  }`)
  for (const menu of menus.menus.nodes) {
    const hits = []
    function walk(items, trail = '') {
      for (const it of items || []) {
        if (/talk|coach|consult|whatsapp|wa\.me/i.test(it.title + ' ' + (it.url || ''))) {
          hits.push({ title: it.title, url: it.url, trail })
        }
        walk(it.items, trail + '/' + it.title)
      }
    }
    walk(menu.items)
    if (hits.length) console.log('menu', menu.handle, hits)
  }
}

// 6) Verify
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 2500))
  const fab = await fetch(
    `https://www.lurvox.in/?sections=mobile-floating-bar&cb=${Date.now()}-${i}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  ).then((r) => r.json())
  const html = fab['mobile-floating-bar'] || ''
  const view = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).then((r) => r.text())
  const talkRes = await fetch(`https://www.lurvox.in/pages/talk-coach?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'manual',
  })
  console.log(i, {
    fabHasWa: html.includes('wa.me/919220451577') && html.includes('free%20consultation'),
    fabHasForce: html.includes('lurvox-talk-wa-force-v1'),
    viewTalkCoach: (view.match(/\/pages\/talk-coach/g) || []).length,
    viewWaConsult: view.includes('free%20consultation'),
    talkStatus: talkRes.status,
    talkLoc: talkRes.headers.get('location'),
  })
  if (
    (html.includes('free%20consultation') || html.includes('lurvox-talk-wa-force')) &&
    talkRes.status >= 300 &&
    talkRes.status < 400
  ) {
    console.log('SUCCESS')
    break
  }
}

console.log('WA', WA)
