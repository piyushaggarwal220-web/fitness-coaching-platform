import fs from 'node:fs'
import path from 'node:path'

const dir = path.join(process.env.TEMP, 'lx-plan-pages')

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
}

function cell(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

for (const file of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  const html = strip(fs.readFileSync(path.join(dir, file), 'utf8'))
  const headings = [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map((m) => cell(m[1]))
  const th = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => cell(m[1])).filter(Boolean)
  const tdNotes = [...html.matchAll(/class="[^"]*note[^"]*"[^>]*>([\s\S]*?)</gi)].map((m) => cell(m[1]))
  const groups = [...html.matchAll(/class="[^"]*(group|eyebrow|sub|callout)[^"]*"[^>]*>([\s\S]*?)</gi)].map((m) =>
    cell(m[2])
  )
  const summaries = [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/gi)].map((m) => cell(m[1]))
  const badges = [
    ...html.matchAll(
      /(Recommended|Popular|Most Popular|Best value|Consistency League|prize|₹5,000|refund|certificate|trophy|countdown|coupon|ALL CAPS)/gi
    ),
  ].map((m) => m[0])
  const ctas = [...html.matchAll(/>([^<]*(Find your plan|Talk to a coach|See plan|Tap to|Compare|Choose|Start with)[^<]*)</gi)].map(
    (m) => m[1].replace(/\s+/g, ' ').trim()
  )
  const league = [...html.matchAll(/[^<>]{0,80}(league|prize money|certificate|trophy|promotion)[^<>]{0,80}/gi)].map((m) =>
    m[0].replace(/\s+/g, ' ').trim()
  )
  const refund = [...html.matchAll(/[^<>]{0,100}refund[^<>]{0,100}/gi)].map((m) => m[0].replace(/\s+/g, ' ').trim())
  console.log(`\n======== ${file} ========`)
  console.log('HEADINGS:')
  headings.forEach((x) => console.log('  ·', x))
  console.log('TH:')
  th.slice(0, 50).forEach((x) => console.log('  ·', x))
  console.log('GROUPS/NOTES:')
  ;[...new Set([...groups, ...tdNotes])].filter((x) => x && x.length < 160).forEach((x) => console.log('  ·', x))
  console.log('FAQ:', summaries.join(' | ') || '(none)')
  console.log('BADGES:', [...new Set(badges)].join(', ') || '(none)')
  console.log('CTAS:', [...new Set(ctas)].join(' | ') || '(none)')
  console.log('LEAGUE:', [...new Set(league)].slice(0, 12).join('\n  ') || '(none)')
  console.log('REFUND:', [...new Set(refund)].slice(0, 8).join('\n  ') || '(none)')
}
