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

// Fix WYG liquid: ensure CTA renders; change cta_url schema to text
let wyg = (await getAsset('blocks/ai_gen_block_68d702b.liquid')).value

// Inspect CTA region
const ctaIdx = wyg.indexOf('block.settings.cta_label')
console.log('cta region:\n', wyg.slice(ctaIdx - 200, ctaIdx + 400))

// Change url type to text so relative paths always work
wyg = wyg.replace(
  `{
      "type": "url",
      "id": "cta_url",
      "label": "CTA link"
    }`,
  `{
      "type": "text",
      "id": "cta_url",
      "label": "CTA link",
      "default": "/pages/league"
    }`
)

// Ensure CTA is not trapped inside a closed if — move CTA just before closing container if needed
// Count endif issues around flat_list
const flatIdx = wyg.indexOf('{% if block.settings.flat_list %}')
console.log('flat_list at', flatIdx)

console.log('wyg put', await putAsset('blocks/ai_gen_block_68d702b.liquid', wyg))

// Set simple relative CTA
const indexAsset = await getAsset('templates/index.json')
const index = JSON.parse(indexAsset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
Object.assign(index.sections.blocks_C9E4qf.blocks[wygKey].settings, {
  cta_url: '/pages/league',
  cta_label: 'See the Consistency League →',
  flat_list: true,
  paragraph: '',
})
console.log('index put', await putAsset('templates/index.json', JSON.stringify(index, null, 2)))

// Inject back-button script into mobile floating bar (loads on all pages including stuck URL)
const fabKeyCandidates = [
  'sections/mobile-floating-bar.liquid',
  'sections/lurvox-mobile-floating-bar.liquid',
]
let fabKey = null
let fab = null
for (const k of fabKeyCandidates) {
  const a = await getAsset(k)
  if (a?.value) {
    fabKey = k
    fab = a.value
    break
  }
}

// Search theme for floating bar filename via REST assets.json list isn't easy; try common names
if (!fab) {
  // try from scripts asset
  const local = path.join('scripts', 'tmp-draft-sections-mobile-floating-bar.liquid')
  if (fs.existsSync(local)) {
    // find actual remote name from a known upload script - use graphql list
  }
}

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  return (await res.json()).data
}

let cursor = null
let fabFiles = []
for (let i = 0; i < 10; i++) {
  const data = await gql(
    `query ($id: ID!, $cursor: String) {
      theme(id: $id) {
        files(first: 100, after: $cursor) {
          nodes { filename }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    { id: `gid://shopify/OnlineStoreTheme/${THEME_ID}`, cursor }
  )
  fabFiles.push(
    ...data.theme.files.nodes
      .map((n) => n.filename)
      .filter((f) => /floating|fab|mobile-float/i.test(f))
  )
  if (!data.theme.files.pageInfo.hasNextPage) break
  cursor = data.theme.files.pageInfo.endCursor
}
console.log('fab files', fabFiles)

if (fabFiles[0]) {
  fabKey = fabFiles[0]
  fab = (await getAsset(fabKey)).value
  if (!fab.includes('ensureLeagueBack')) {
    fab += `
<script>
(function(){
  function ensureLeagueBack(){
    var hero=document.querySelector('.lx-league__hero');
    if(!hero||hero.querySelector('.lx-league__back')) return;
    var a=document.createElement('a');
    a.className='lx-league__back';
    a.href='/';
    a.textContent='\\u2190 Go back';
    a.style.cssText='display:inline-flex;margin:0 0 1.25rem;color:rgba(255,255,255,.72);text-decoration:none;font-size:.8rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase';
    hero.insertBefore(a, hero.firstChild);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ensureLeagueBack);
  else ensureLeagueBack();
})();
</script>
`
    console.log('fab put', await putAsset(fabKey, fab))
  }
}

await new Promise((r) => setTimeout(r, 4000))
const stuck = await fetch('https://www.lurvox.in/pages/consistency-league?v=' + Date.now()).then(
  (r) => r.text()
)
console.log({
  stuckHasFabScript: stuck.includes('ensureLeagueBack'),
  stuckHasBack: stuck.includes('lx-league__back'),
})
