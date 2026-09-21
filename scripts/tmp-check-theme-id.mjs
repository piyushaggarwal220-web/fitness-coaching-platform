import fs from 'node:fs'
import path from 'node:path'
function theme(file) {
  const html = fs.readFileSync(file, 'utf8')
  const m = html.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\})/)
  const bust = html.match(/lurvox-cache-bust (\d+)/)
  return { bust: bust && bust[1], theme: m && m[1].slice(0, 180) }
}
const dir = path.join(process.env.TEMP, 'lx-plan-verify')
for (const f of ['home.html', 'comparefit.html', 'choose.html']) {
  const p = path.join(dir, f)
  if (fs.existsSync(p)) console.log(f, theme(p))
}
