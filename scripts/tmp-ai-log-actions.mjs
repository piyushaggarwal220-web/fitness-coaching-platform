import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data, error } = await admin
  .from('ai_generation_logs')
  .select('action, model, prompt_tokens, completion_tokens, success, created_at')
  .order('created_at', { ascending: false })
  .limit(3000)

if (error) {
  console.error(error.message)
  process.exit(1)
}
console.log(`rows fetched: ${data.length}`)

const byAction = {}
for (const r of data) {
  const k = `${r.action} | ${r.model ?? 'null'}`
  byAction[k] ??= { n: 0, ok: 0, inTok: 0, outTok: 0, withTok: 0 }
  const b = byAction[k]
  b.n++
  if (r.success) b.ok++
  if (r.prompt_tokens && r.completion_tokens) {
    b.withTok++
    b.inTok += r.prompt_tokens
    b.outTok += r.completion_tokens
  }
}
console.log('\naction | model -> count, success, avgIn, avgOut')
for (const [k, b] of Object.entries(byAction).sort((a, b) => b[1].n - a[1].n)) {
  console.log(
    `${k} -> n=${b.n} ok=${b.ok} tokRows=${b.withTok} avgIn=${b.withTok ? Math.round(b.inTok / b.withTok) : 0} avgOut=${
      b.withTok ? Math.round(b.outTok / b.withTok) : 0
    }`
  )
}
