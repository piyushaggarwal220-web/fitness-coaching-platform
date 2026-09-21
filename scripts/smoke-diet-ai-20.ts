/**
 * 20 smoke checks for diet AI + production deploy.
 * Run: npx tsx --env-file=.env.local.txt scripts/smoke-diet-ai-20.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

type Result = { id: number; name: string; ok: boolean; detail: string }

const results: Result[] = []
const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

function check(id: number, name: string, ok: boolean, detail: string) {
  results.push({ id, name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id.toString().padStart(2, '0')}. ${name}${detail ? ` — ${detail}` : ''}`)
}

async function headOrGet(url: string): Promise<{ status: number; headers: Headers; body?: string }> {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' })
  const body = await res.text()
  return { status: res.status, headers: res.headers, body }
}

async function postStatus(url: string, body: unknown): Promise<number> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.status
}

async function main() {
  const app = 'https://app.lurvox.in'

  // 1–5: production HTTP
  try {
    const login = await headOrGet(`${app}/login`)
    check(1, 'Production /login returns 200', login.status === 200, `status=${login.status}`)
  } catch (e) {
    check(1, 'Production /login returns 200', false, String(e))
  }

  try {
    const status = await postStatus(`${app}/api/auth/login`, { email: 'smoke@example.com', password: 'wrong' })
    check(2, 'Auth login API reachable (not 404)', status !== 404, `status=${status}`)
  } catch (e) {
    check(2, 'Auth login API reachable (not 404)', false, String(e))
  }

  try {
    const status = await postStatus(`${app}/api/coach/edit-plan-section`, {
      clientId: '00000000-0000-0000-0000-000000000000',
      section: 'nutrition',
      currentText: 'x',
      coachInstruction: 'smoke',
    })
    check(3, 'Coach edit-plan-section route exists', status === 401 || status === 403, `status=${status}`)
  } catch (e) {
    check(3, 'Coach edit-plan-section route exists', false, String(e))
  }

  try {
    const status = await postStatus(`${app}/api/coach/remake-plan`, {
      clientId: '00000000-0000-0000-0000-000000000000',
    })
    check(4, 'Coach remake-plan route exists', status === 401 || status === 403, `status=${status}`)
  } catch (e) {
    check(4, 'Coach remake-plan route exists', false, String(e))
  }

  try {
    const coachLogin = await headOrGet(`${app}/coach/login`)
    check(5, 'Production /coach/login returns 200', coachLogin.status === 200, `status=${coachLogin.status}`)
  } catch (e) {
    check(5, 'Production /coach/login returns 200', false, String(e))
  }

  // 6–8: prompt library in Supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    check(6, 'Prompt library initial_diet published v13+', false, 'missing Supabase env')
    check(7, 'Prompt library weekly_diet_update published v11+', false, 'missing Supabase env')
    check(8, 'Published initial diet body has lifestyle rule', false, 'missing Supabase env')
  } else {
    const admin = createClient(url, key, { auth: { persistSession: false } })
    const { data: initialRows } = await admin
      .from('prompt_library')
      .select('id, slug')
      .eq('category', 'initial_diet')
      .is('archived_at', null)
      .limit(1)
    const initialId = initialRows?.[0]?.id as string | undefined
    let initialVersion = 0
    let initialBody = ''
    if (initialId) {
      const { data: ver } = await admin
        .from('prompt_library_versions')
        .select('version, prompt_body, status')
        .eq('prompt_id', initialId)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      initialVersion = (ver as { version?: number } | null)?.version ?? 0
      initialBody = (ver as { prompt_body?: string } | null)?.prompt_body ?? ''
    }
    check(6, 'Prompt library initial_diet published v13+', initialVersion >= 13, `version=${initialVersion}`)

    const { data: weeklyRows } = await admin
      .from('prompt_library')
      .select('id')
      .eq('category', 'weekly_diet_update')
      .is('archived_at', null)
      .limit(1)
    const weeklyId = weeklyRows?.[0]?.id as string | undefined
    let weeklyVersion = 0
    if (weeklyId) {
      const { data: ver } = await admin
        .from('prompt_library_versions')
        .select('version')
        .eq('prompt_id', weeklyId)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      weeklyVersion = (ver as { version?: number } | null)?.version ?? 0
    }
    check(7, 'Prompt library weekly_diet_update published v11+', weeklyVersion >= 11, `version=${weeklyVersion}`)

    const lifestyleOk =
      /never a random chart/i.test(initialBody) || /CLIENT LIFESTYLE|Build from this client's lifestyle/i.test(initialBody)
    check(8, 'Published initial diet body has lifestyle rule', lifestyleOk, lifestyleOk ? 'found' : 'missing phrase')
  }

  // 9–20: local source / prompt file smoke
  const initialPrompt = read('prompts/production/initial-diet.prompt')
  const updatedPrompt = read('prompts/production/updated-diet.prompt')
  const quality = read('src/lib/ai/plan-quality-rules.ts')
  const prose = read('src/lib/ai/plan-prose-guards.ts')
  const edit = read('src/lib/ai/edit-plan-section.ts')
  const builder = read('src/lib/ai/prompt-builder.ts')
  const editRoute = read('src/app/api/coach/edit-plan-section/route.ts')
  const editor = read('src/components/PlanEditor.tsx')
  const modal = read('src/components/coach/PlanSectionAiEditModal.tsx')
  const calories = read('src/lib/ai/calorie-targets.ts')
  const generate = read('src/lib/ai/generate-plan.ts')
  const actions = read('src/lib/coach/ai-actions.ts')

  check(
    9,
    'Initial prompt forbids inventing meal slots',
    /don't invent new meal slots|do not invent new meal/i.test(initialPrompt),
    'meal timing rule'
  )
  check(
    10,
    'Initial prompt has veg/non-veg day respect',
    /Respect veg\/non-veg|veg days|Hard Constraints/i.test(initialPrompt),
    'preference rule'
  )
  check(
    11,
    'Updated prompt keeps lifestyle (no random chart)',
    /never invent a random chart|usual foods|lifestyle/i.test(updatedPrompt),
    'update lifestyle'
  )
  check(
    12,
    'DIET_LIFESTYLE_RESPECT_RULES exported',
    quality.includes('DIET_LIFESTYLE_RESPECT_RULES') && quality.includes('never a random generic chart'),
    quality.includes('lifestyle-respect-v17') ? 'v17' : 'rules present'
  )
  check(
    13,
    'DIET_MODIFY_PLAN_RULES preserves current chart',
    prose.includes('DIET_MODIFY_PLAN_RULES') && prose.includes('MODIFY it'),
    'modify mode'
  )
  check(
    14,
    'edit-plan-section uses lifestyle + modify mode',
    edit.includes('DIET_LIFESTYLE_RESPECT_RULES') &&
      edit.includes('isDietModify') &&
      edit.includes('autoDietModifyInstruction'),
    'edit path'
  )
  check(
    15,
    'prompt-builder injects meal timings MUST match',
    builder.includes('Meal timings (MUST match in the plan)') &&
      builder.includes('Favorite foods (prioritize)'),
    'timings + favorites'
  )
  check(
    16,
    'edit-plan-section API selects diet_preference',
    editRoute.includes('diet_preference'),
    'API profile fields'
  )
  check(
    17,
    'PlanEditor labels: Modify diet / Remake entire plan',
    editor.includes('Modify with AI') && editor.includes('Remake entire plan with AI'),
    'UI labels'
  )
  check(
    18,
    'Diet modal: Apply to current diet + Remake from scratch',
    modal.includes('Apply to current diet') && modal.includes('Remake from scratch'),
    'modal actions'
  )
  check(
    19,
    'autoDietModifyInstruction exists (preserve current)',
    calories.includes('autoDietModifyInstruction') &&
      calories.includes('do not replace it with a completely different week'),
    'calorie-targets'
  )
  check(
    20,
    'Generate + coach actions inject lifestyle/preference',
    generate.includes('DIET_LIFESTYLE_RESPECT_RULES') &&
      actions.includes('never a random generic chart') &&
      quality.includes('DIET_PREFERENCE_ENFORCEMENT_RULES'),
    'generate + actions'
  )

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  console.log('\n=== SMOKE SUMMARY ===')
  console.log(`${passed}/20 passed`)
  if (failed.length) {
    console.log('Failed:')
    for (const f of failed) console.log(`  ${f.id}. ${f.name} — ${f.detail}`)
    process.exit(1)
  }
  console.log('All 20 smoke checks passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
