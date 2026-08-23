import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEST = path.join(ROOT, 'tmp-shopify-price-push')

function patchPrices(text) {
  return text
    .replace(/"plan_2_price": "\d+"/g, '"plan_2_price": "1299"')
    .replace(/"plan_3_price": "\d+"/g, '"plan_3_price": "2099"')
    .replace(/"plan_4_price": "\d+"/g, '"plan_4_price": "3499"')
    .replace(/"plan_2_monthly": "[^"]*"/g, '"plan_2_monthly": "≈ ₹433/month"')
    .replace(/"plan_3_monthly": "[^"]*"/g, '"plan_3_monthly": "≈ ₹350/month"')
    .replace(/"plan_4_monthly": "[^"]*"/g, '"plan_4_monthly": "≈ ₹292/month"')
    .replace(/₹\s*2,999/g, '₹3,499')
    .replace(/₹\s*1,699/g, '₹2,099')
    .replace(/₹\s*999(?!\d)/g, '₹1,299')
    .replace(/data-plan-price=\\"999\\"/g, 'data-plan-price=\\"1299\\"')
    .replace(/data-plan-price=\\"1699\\"/g, 'data-plan-price=\\"2099\\"')
    .replace(/data-plan-price=\\"2999\\"/g, 'data-plan-price=\\"3499\\"')
    .replace(/₹\s*333(\/mo|\/month)?/g, '₹433$1')
    .replace(/₹\s*283(\/mo|\/month)?/g, '₹350$1')
    .replace(/₹\s*250\/mo/g, '₹292/mo')
    .replace(/₹\s*250\/month/g, '₹292/month')
}

const copies = [
  ['scripts/shopify-assets/sections-lurvox-plan-finder.liquid', 'sections/lurvox-plan-finder.liquid'],
  ['scripts/shopify-assets/sections-lurvox-ad-landing.liquid', 'sections/lurvox-ad-landing.liquid'],
  ['scripts/shopify-assets/sections-lurvox-hide-1month.liquid', 'sections/lurvox-hide-1month.liquid'],
  ['scripts/shopify-assets/sections-lurvox-plan-compare.liquid', 'sections/lurvox-plan-compare.liquid'],
  ['scripts/shopify-assets/sections-lurvox-cart-builder.liquid', 'sections/lurvox-cart-builder.liquid'],
  ['scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid', 'snippets/lurvox-plan-compare-inline.liquid'],
  ['scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid', 'snippets/lurvox-conversion-boost.liquid'],
  ['scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid', 'blocks/ai_gen_block_361650c.liquid'],
  ['scripts/shopify-assets/templates-page.compare-plans.json', 'templates/page.compare-plans.json'],
]

for (const [from, to] of copies) {
  const dest = path.join(DEST, to)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(path.join(ROOT, from), dest)
}

const indexPath = path.join(DEST, 'templates/index.json')
fs.writeFileSync(indexPath, patchPrices(fs.readFileSync(indexPath, 'utf8')))

const layoutPath = path.join(DEST, 'layout/theme.liquid')
const stamp = Date.now()
const layout = fs.readFileSync(layoutPath, 'utf8').replace(
  /<!-- lurvox-cache-bust \d+ -->/,
  `<!-- lurvox-cache-bust ${stamp} -->`
)
fs.writeFileSync(layoutPath, layout)

const only = [
  'templates/index.json',
  'layout/theme.liquid',
  ...copies.map(([, to]) => to),
]
const args = [
  'theme',
  'push',
  '--store',
  '9uwyq1-0j.myshopify.com',
  '--theme',
  '161454620923',
  '--path',
  DEST,
  '--allow-live',
  '--force',
  ...only.flatMap((file) => ['--only', file]),
]
console.log('pushing', only.join(', '))
const result = spawnSync('shopify', args, { stdio: 'inherit', shell: true, cwd: ROOT })
process.exit(result.status ?? 1)
