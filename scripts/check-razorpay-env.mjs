import fs from 'node:fs'
import { execSync } from 'node:child_process'

const p = '.env.local'
if (!fs.existsSync(p)) {
  console.log('no .env.local')
} else {
  const t = fs.readFileSync(p, 'utf8')
  for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
    const m = t.match(new RegExp(`^${k}=(.*)$`, 'm'))
    if (!m) {
      console.log(`${k}: MISSING`)
      continue
    }
    const v = m[1].trim().replace(/^["']|["']$/g, '')
    if (!v) console.log(`${k}: EMPTY`)
    else console.log(`${k}: SET len=${v.length} prefix=${v.slice(0, 7)}…`)
  }
}

try {
  const out = execSync('npx vercel env ls production', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const lines = out.split(/\r?\n/).filter((l) => /RAZORPAY|Environment/i.test(l))
  console.log('--- vercel production env (filtered) ---')
  console.log(lines.join('\n') || '(no RAZORPAY vars listed)')
} catch (e) {
  console.log('vercel env ls failed:', e.stderr?.toString?.() || e.message)
}
