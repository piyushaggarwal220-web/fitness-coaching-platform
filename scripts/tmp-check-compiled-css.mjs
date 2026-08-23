import fs from 'node:fs'

const html = fs.readFileSync('C:/Users/DELL/coaching-platform/scripts/tmp-live-now.html', 'utf8')

// Where does equal-plan-shine appear? inline style or not
const i = html.indexOf('lurvox-equal-plan-shine')
console.log('equalShine index in HTML:', i)
if (i > -1) {
  console.log('--- context ---')
  console.log(html.slice(Math.max(0, i - 300), i + 300))
}

const cssUrl = 'https://www.lurvox.in/cdn/shop/t/10/compiled_assets/styles.css'
const res = await fetch(`${cssUrl}?v=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
})
const css = await res.text()
console.log('\ncompiled styles.css status', res.status, 'bytes', css.length)
const markers = [
  'lurvox-equal-plan-shine',
  'lurvox-hide-plan-radios-v1',
  'lurvox-mobile-plan-cards-v1',
  'lurvox-mobile-client-results-v1',
  'lurvox-mobile-fitness-gallery-v1',
]
for (const m of markers) console.log('  ', m.padEnd(34), css.includes(m))

// Also fetch the exact versioned URL the page references
const versioned = html.match(/compiled_assets\/styles\.css\?v=(\d+)/)
console.log('\npage references compiled version:', versioned?.[1])
