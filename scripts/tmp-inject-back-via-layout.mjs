import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token.access_token } }
  )
  return (await res.json()).asset
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.asset?.updated_at
}

const SNIPPET = `
{% if request.page_type == 'page' %}
<script>
(function () {
  function ensureLeagueBack() {
    var hero = document.querySelector('.lx-league__hero');
    if (!hero || hero.querySelector('.lx-league__back')) return;
    var a = document.createElement('a');
    a.className = 'lx-league__back';
    a.href = '/';
    a.textContent = '\\u2190 Go back';
    hero.insertBefore(a, hero.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureLeagueBack);
  } else {
    ensureLeagueBack();
  }
})();
</script>
<style>
  .lx-league__back {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0 0 1.25rem;
    color: rgba(255,255,255,0.72);
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .lx-league__back:hover { color: #fff; }
</style>
{% endif %}
`

const layout = await getAsset('layout/theme.liquid')
let liquid = layout.value

// Remove prior probes/injections
liquid = liquid.replace(/<!-- LX-LAYOUT-PROBE-V1 -->\n?/g, '')
liquid = liquid.replace(
  /\n?{% if request\.page_type == 'page' %}[\s\S]*?ensureLeagueBack[\s\S]*?{% endif %}\n?/g,
  '\n'
)

if (!liquid.includes('ensureLeagueBack')) {
  if (liquid.includes('</body>')) {
    liquid = liquid.replace('</body>', `${SNIPPET}\n</body>`)
  } else {
    throw new Error('No </body> in theme.liquid')
  }
}

console.log('layout put', await putAsset('layout/theme.liquid', liquid))

// Point CTA + FAQ links to working /pages/league
const indexAsset = await getAsset('templates/index.json')
const index = JSON.parse(indexAsset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
Object.assign(index.sections.blocks_C9E4qf.blocks[wygKey].settings, {
  flat_list: true,
  paragraph: '',
  highlight_text:
    'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote',
  cta_label: 'See the Consistency League →',
  cta_url: 'https://www.lurvox.in/pages/league',
})

let out = JSON.stringify(index, null, 2)
// Prefer working URL everywhere in homepage JSON
out = out.split('https://www.lurvox.in/pages/consistency-league').join('https://www.lurvox.in/pages/league')
out = out.split('/pages/consistency-league').join('/pages/league')

console.log('index put', await putAsset('templates/index.json', out))
fs.writeFileSync(path.join('scripts', 'tmp-wyg-flat-index.json'), out)

await new Promise((r) => setTimeout(r, 5000))

// Verify layout injection appears on stuck URL
const stuck = await fetch('https://www.lurvox.in/pages/consistency-league?v=' + Date.now()).then(
  (r) => r.text()
)
const league = await fetch('https://www.lurvox.in/pages/league?v=' + Date.now()).then((r) =>
  r.text()
)
const home = await fetch('https://www.lurvox.in/?v=' + Date.now()).then((r) => r.text())

console.log({
  stuckHasScript: stuck.includes('ensureLeagueBack'),
  stuckHasBackClassInHtml: stuck.includes('lx-league__back'),
  leagueHasBack: league.includes('lx-league__back'),
  homeHasSeeCta: home.includes('See the Consistency League'),
  homeHasDiet: home.includes('Diet tracker'),
  homeHasFlat: home.includes('ai-what-you-get-flat'),
  homeHasRewardsFirst: home.includes('REWARDS FIRST'),
  homeHighlightOk: home.includes('Prize money up to'),
})
