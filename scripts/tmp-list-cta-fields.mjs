import fs from 'node:fs'

const c = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-theme-templates-index.json',
  'utf8'
)

const re = /"[^"]*(?:cta|button|link|url|href)[^"]*"\s*:\s*"[^"]*"/gi
const matches = [...c.matchAll(re)].map((m) => m[0])
for (const m of matches) {
  if (/http|rzp|app\.|checkout|login|\//i.test(m)) console.log(m)
}
