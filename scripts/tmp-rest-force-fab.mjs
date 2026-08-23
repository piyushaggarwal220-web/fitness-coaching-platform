import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const headers = { 'X-Shopify-Access-Token': token.access_token }
const themeId = '161112981755'

const res = await fetch(
  `https://9uwyq1-0j.myshopify.com/admin/api/2025-01/themes/${themeId}/assets.json?asset[key]=sections/mobile-floating-bar.liquid`,
  { headers }
)
const json = await res.json()
const value = json.asset?.value || ''
console.log({
  talkCoach: (value.match(/\/pages\/talk-coach/g) || []).length,
  talkToACoach: (value.match(/\/pages\/talk-to-a-coach/g) || []).length,
  redirect: value.includes('lurvox-talk-path-redirect-v1'),
  updated: json.asset?.updated_at,
  size: value.length,
})

// Force rewrite consult_url assignment if present
let next = value
next = next.replaceAll('/pages/talk-to-a-coach', '/pages/talk-coach')
if (!next.includes('lurvox-talk-path-redirect-v1')) {
  next += `
<script>
/* lurvox-talk-path-redirect-v1 */
(function () {
  try {
    var path = window.location.pathname || '';
    while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (path === '/pages/talk-to-a-coach') {
      window.location.replace('/pages/talk-coach' + window.location.search + window.location.hash);
    }
  } catch (e) {}
})();
</script>
`
}

const put = await fetch(`https://9uwyq1-0j.myshopify.com/admin/api/2025-01/themes/${themeId}/assets.json`, {
  method: 'PUT',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ asset: { key: 'sections/mobile-floating-bar.liquid', value: next } }),
})
console.log('put', put.status)

await new Promise((r) => setTimeout(r, 6000))
const home = await (await fetch('https://www.lurvox.in/?nocache=' + Date.now())).text()
console.log({
  homeRedirect: home.includes('lurvox-talk-path-redirect-v1'),
  homeTalkCoach: (home.match(/\/pages\/talk-coach/g) || []).length,
  homeOld: (home.match(/\/pages\/talk-to-a-coach/g) || []).length,
})
