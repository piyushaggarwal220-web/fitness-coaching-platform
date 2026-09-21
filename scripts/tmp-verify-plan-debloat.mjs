import fs from 'node:fs'
import path from 'node:path'

const dir = path.join(process.env.TEMP, 'lx-plan-verify')

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
}

function cell(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const needles = [
  'Debloat',
  'Most Popular',
  'Complete transformation',
  'Save ₹',
  '≈ ₹',
  'Fuller stack',
  'Lowest monthly rate',
  'Opens with',
  'More with 6',
  'Everything with 12',
  'Per month',
  '₹666',
  'Tap to know',
  'Back to home',
  'CHOOSE YOUR GOAL',
  'Weekly coach phone call is 12-month only',
  'Find your plan',
  'Talk to a coach',
  '3, 6, or 12 months',
  'Chat + check-ins',
  'Weekly calls',
  'What you get on the platform',
  'Questions before you start',
  'Consistency League',
  'prize money',
  'Product details',
  '3 months',
  '₹1,999',
  '₹3,499',
  '₹5,999',
]

for (const file of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(dir, file), 'utf8')
  const t = strip(html)
  const headings = [...t.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map((m) => cell(m[1]))
  const th = [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => cell(m[1])).filter(Boolean)
  console.log('\n========', file, '========')
  console.log('HEADINGS:')
  headings.filter((h) => !/cart is empty|Search|Products/i.test(h)).forEach((x) => console.log('  ·', x))
  if (th.length) {
    console.log('TH:')
    th.forEach((x) => console.log('  ·', x))
  }
  console.log('NEEDLES:')
  for (const n of needles) {
    const hit = t.includes(n)
    if (hit) console.log('  YES', n)
  }
  const missing = needles.filter((n) => !t.includes(n) && /Debloat|Most Popular|Fuller stack|Lowest monthly|Tap to know|Back to home|CHOOSE YOUR GOAL|Save ₹|≈ ₹|Opens with|Per month|₹666/.test(n))
  if (missing.length) console.log('REMOVED_OK', missing.join(' | '))
}
