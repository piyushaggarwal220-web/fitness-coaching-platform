import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const assets = path.join(ROOT, 'scripts', 'shopify-assets')
const slim = fs.readFileSync(path.join(assets, 'templates-page.compare-short.json'), 'utf8')

fs.writeFileSync(path.join(ROOT, 'scripts', 'tmp-plan-debloat-draft', 'templates__page.compare-stair.json'), slim)
fs.writeFileSync(path.join(ROOT, 'scripts', 'tmp-plan-debloat-draft', 'templates__page.compare-detail.json'), slim)

const indexPath = path.join(ROOT, 'scripts', 'tmp-plan-debloat-draft', 'templates__index.json')
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
const block = index?.sections?.home_blocks_v2?.blocks?.ai_gen_block_361650c_qqYKXh
if (!block?.settings) throw new Error('homepage plan block not found')

const s = block.settings
s.top_label = '3 · 6 · 12 months'
s.headline = 'Pick your goal. We handle the rest.'
s.subheadline =
  'Every plan: workout, diet, a human coach, check-ins, trackers, and chat. Weekly phone calls are 12-month only.'
s.plan_2_badge = ''
s.plan_2_duration = '3 months'
s.plan_2_monthly = ''
s.plan_2_savings = ''
s.plan_2_description = ''
s.plan_2_footer = 'Best for a 90-day fat-loss push.'
s.plan_3_badge = ''
s.plan_3_duration = '6 months'
s.plan_3_monthly = ''
s.plan_3_savings = ''
s.plan_3_description = ''
s.plan_3_footer = 'Best for losing fat while building muscle.'
s.plan_4_badge = 'Weekly calls'
s.plan_4_duration = '12 months'
s.plan_4_monthly = ''
s.plan_4_savings = ''
s.plan_4_description = ''
s.plan_4_footer = 'Best for an athletic body. Includes a weekly coach phone call.'
s.trust_stat = 'A human coach in the app — not a PDF.'
s.trust_item_1 = ''
s.trust_item_2 = ''
s.trust_item_3 = ''
s.trust_item_4 = ''

fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`)
console.log('patched homepage plan cards')
