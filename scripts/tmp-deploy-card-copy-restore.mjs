import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = [161429127419, 161391804667]

async function put(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${themeId} ${key} ${JSON.stringify(json).slice(0, 250)}`)
  console.log('ok', themeId, key, value.length)
}

async function get(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`get ${key}`)
  return json.asset.value
}

function patchIndexMatrix(index) {
  let next = index
  const pairs = [
    [
      'https://app.lurvox.in/plans/3-months\\">Choose<\\/a>',
      'https://app.lurvox.in/checkout?plan=3_months\\">Start · ₹999<\\/a>',
    ],
    [
      'https://app.lurvox.in/plans/6-months\\">Choose<\\/a>',
      'https://app.lurvox.in/checkout?plan=6_months\\">Start · ₹1,699<\\/a>',
    ],
    [
      'https://app.lurvox.in/plans/12-months\\">Choose<\\/a>',
      'https://app.lurvox.in/checkout?plan=12_months\\">Start · ₹2,999<\\/a>',
    ],
    [
      'https://app.lurvox.in/plans/3-months">Choose</a>',
      'https://app.lurvox.in/checkout?plan=3_months">Start · ₹999</a>',
    ],
    [
      'https://app.lurvox.in/plans/6-months">Choose</a>',
      'https://app.lurvox.in/checkout?plan=6_months">Start · ₹1,699</a>',
    ],
    [
      'https://app.lurvox.in/plans/12-months">Choose</a>',
      'https://app.lurvox.in/checkout?plan=12_months">Start · ₹2,999</a>',
    ],
  ]
  let n = 0
  for (const [from, to] of pairs) {
    if (next.includes(from)) {
      next = next.split(from).join(to)
      n++
    }
  }
  return { next, n }
}

// Also add matrix rewrite + price comma formatting into conversion boost
let boost = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'),
  'utf8'
)
if (!boost.includes('lurvox-matrix-choose-rewrite-v1')) {
  boost = boost.replace(
    'normalizeTalkLinks();\n    document.addEventListener(\'DOMContentLoaded\', normalizeTalkLinks);',
    `normalizeTalkLinks();
    document.addEventListener('DOMContentLoaded', normalizeTalkLinks);

    // lurvox-matrix-choose-rewrite-v1
    function rewriteMatrixChoose() {
      var map = {
        '3-months': ['https://app.lurvox.in/checkout?plan=3_months', 'Start · ₹999'],
        '6-months': ['https://app.lurvox.in/checkout?plan=6_months', 'Start · ₹1,699'],
        '12-months': ['https://app.lurvox.in/checkout?plan=12_months', 'Start · ₹2,999'],
        '3_months': ['https://app.lurvox.in/checkout?plan=3_months', 'Start · ₹999'],
        '6_months': ['https://app.lurvox.in/checkout?plan=6_months', 'Start · ₹1,699'],
        '12_months': ['https://app.lurvox.in/checkout?plan=12_months', 'Start · ₹2,999']
      };
      document.querySelectorAll('.lx-matrix__table a').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        Object.keys(map).forEach(function (key) {
          if (href.indexOf(key) !== -1) {
            a.setAttribute('href', map[key][0]);
            if (/^Choose$/i.test((a.textContent || '').trim())) a.textContent = map[key][1];
          }
        });
      });
    }
    function formatPlanCardPrices() {
      document.querySelectorAll('[class*="ai-transformation-plan-card-original-price"],[class*="ai-transformation-plan-card-price-"]').forEach(function (el) {
        var t = (el.textContent || '').trim();
        var m = t.match(/^(₹|Rs\\s*)(\\d+)$/i);
        if (!m) return;
        var n = Number(m[2]);
        if (!Number.isFinite(n) || n < 1000) return;
        el.textContent = '₹' + n.toLocaleString('en-IN');
      });
    }
    rewriteMatrixChoose();
    formatPlanCardPrices();
    document.addEventListener('DOMContentLoaded', function () {
      rewriteMatrixChoose();
      formatPlanCardPrices();
    });`
  )
  fs.writeFileSync(
    path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'),
    boost
  )
}

const planBlock = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'),
  'utf8'
)
if (!planBlock.includes('Keep short benefit copy on phone')) {
  throw new Error('plan block missing mobile footer restore')
}

for (const themeId of themes) {
  await put(themeId, 'blocks/ai_gen_block_361650c.liquid', planBlock)
  await put(themeId, 'snippets/lurvox-conversion-boost.liquid', boost)
  await put(
    themeId,
    'snippets/lurvox-plan-compare-inline.liquid',
    fs.readFileSync(
      path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
      'utf8'
    )
  )

  const index = await get(themeId, 'templates/index.json')
  const { next, n } = patchIndexMatrix(index)
  console.log('index matrix replacements', themeId, n)
  if (n > 0) await put(themeId, 'templates/index.json', next)
}

console.log('deployed card copy restore')
