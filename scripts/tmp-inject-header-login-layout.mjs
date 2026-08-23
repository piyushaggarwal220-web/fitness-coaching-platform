import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161454620923
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

const get = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
if (!get.ok) throw new Error(await get.text())
let layout = (await get.json()).asset.value

const START = '{%- comment -%} lx-header-existing-login {%- endcomment -%}'
const END = '{%- comment -%} /lx-header-existing-login {%- endcomment -%}'
const snippet = `${START}
<style id="lx-header-existing-login-css">
  a.lx-header-login {
    display: inline-flex !important;
    align-items: center;
    color: #ff8a3d !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    text-decoration: none !important;
    white-space: nowrap;
    margin: 0 8px 0 0;
  }
</style>
<script>
  (function () {
    var URL = 'https://app.lurvox.in/login';
    function add() {
      if (document.getElementById('lx-header-login')) return;
      var host = document.querySelector('.header-actions')
        || document.querySelector('.header__icons')
        || document.querySelector('[class*="header-actions"]');
      if (!host) return;
      var a = document.createElement('a');
      a.id = 'lx-header-login';
      a.className = 'lx-header-login';
      a.href = URL;
      a.textContent = 'Log in';
      a.setAttribute('aria-label', 'Existing client log in');
      host.insertBefore(a, host.firstChild);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  })();
</script>
${END}
`

if (layout.includes(START)) {
  layout = layout.replace(new RegExp(`${START}[\\s\\S]*?${END}`), snippet)
} else if (layout.includes('</body>')) {
  layout = layout.replace('</body>', `${snippet}\n</body>`)
} else {
  layout += `\n${snippet}\n`
}

const put = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
})
if (!put.ok) throw new Error(await put.text())
console.log('layout login inject ok')
