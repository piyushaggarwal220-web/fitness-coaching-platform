import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()

const key = 'sections/lurvox-client-login.liquid'
const get = await fetch(
  `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers: H }
)
let value = (await get.json()).asset.value

const START = '{%- comment -%} lurvox-stabilize-trial-v1 {%- endcomment -%}'
const END = '{%- comment -%} /lurvox-stabilize-trial-v1 {%- endcomment -%}'
const SNIPPET = `${START}
<style id="lurvox-stabilize-trial">
  /* Keep the 7-day trial visible. Never let legacy hide/show scripts flicker it. */
  [data-plan-index="1"][data-plan-price="179"],
  [data-plan-index="1"][data-plan-link*="trial"] {
    display: block !important;
    visibility: visible !important;
  }
  [data-plan-index="1"][data-plan-price="999"],
  [data-plan-index="1"][data-plan-price="499"] {
    display: none !important;
  }
</style>
<script>
(function () {
  if (window.__lurvoxTrialStabilized) return;
  window.__lurvoxTrialStabilized = true;
  function stabilize() {
    document.querySelectorAll('[data-plan-index="1"][data-plan-price="179"],[data-plan-index="1"][data-plan-link*="trial"]').forEach(function (el) {
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
    });
  }
  stabilize();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stabilize, { once: true });
  // Cover the old 400/1200/2500ms toggler windows without becoming a loop ourselves.
  setTimeout(stabilize, 50);
  setTimeout(stabilize, 450);
  setTimeout(stabilize, 1300);
  setTimeout(stabilize, 2600);
})();
</script>
${END}
`

value = value.replace(
  /\{%- comment -%\} lurvox-stabilize-trial-v1[\s\S]*?\{%- comment -%\} \/lurvox-stabilize-trial-v1 \{%- endcomment -%\}\n?/g,
  ''
)

if (value.includes('{% schema %}')) {
  value = value.replace('{% schema %}', SNIPPET + '\n{% schema %}')
} else {
  value = value.trimEnd() + '\n' + SNIPPET + '\n'
}

const put = await fetch(`${REST}/themes/${themeId}/assets.json`, {
  method: 'PUT',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ asset: { key, value } }),
})
const putJson = await put.json()
if (!put.ok || putJson.errors) throw new Error(JSON.stringify(putJson))
console.log('updated', key, 'bytes', value.length)

// Save local copy
const out = path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'sections', 'lurvox-client-login.liquid')
fs.writeFileSync(out, value)
console.log('saved local', out)

// Poll until the stabilizer appears on /
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126', 'Cache-Control': 'no-cache' },
    })
  ).text()
  const has = html.includes('lurvox-stabilize-trial-v1') || html.includes('lurvox-stabilize-trial')
  console.log(i, { hasStabilizer: has, showTrialPlan: html.includes('showTrialPlan') })
  if (has) {
    console.log('STABILIZER LIVE ON HOMEPAGE')
    process.exit(0)
  }
}
process.exit(1)
