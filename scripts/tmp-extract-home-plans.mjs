import fs from 'node:fs'
import path from 'node:path'

const html = fs.readFileSync(path.join(process.env.TEMP, 'lx-plan-pages', 'home.html'), 'utf8')

function sliceAround(needle, before = 200, after = 8000) {
  const i = html.indexOf(needle)
  if (i < 0) return `MISSING ${needle}`
  return html.slice(Math.max(0, i - before), i + after)
}

const markers = [
  'id="plans"',
  'CHOOSE YOUR GOAL',
  'ai-transformation-plan',
  'lx-matrix',
  'Most Popular',
  'Debloat',
  '≈ ₹',
  'Save ₹',
  'Weekly coach phone',
  'lx-wyg',
]
for (const m of markers) {
  console.log('\n====', m, 'idx', html.indexOf(m), '====')
}

const start = html.indexOf('CHOOSE YOUR GOAL')
const wyg = html.indexOf('What you get on the platform')
console.log('\n\n===== PLAN BLOCK TEXT =====\n')
const chunk = html.slice(start, wyg > start ? wyg : start + 25000)
const text = chunk
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .split('\n')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter((s) => s && s.length < 200)
console.log([...new Set(text)].join('\n'))
