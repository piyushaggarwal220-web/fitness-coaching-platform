import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const queueSrc = readFileSync(resolve('src/lib/coach-work-queue.ts'), 'utf8')
const panelSrc = readFileSync(resolve('src/components/coach/CoachWorkQueuePanel.tsx'), 'utf8')
const routeSrc = readFileSync(resolve('src/app/api/coach/work-queue/route.ts'), 'utf8')
const dashSrc = readFileSync(resolve('src/app/coach/dashboard/page.tsx'), 'utf8')
const migrationSrc = readFileSync(
  resolve('supabase/migrations/20260814120000_work_queue_load_indexes.sql'),
  'utf8'
)

// Parallel waves instead of sequential browser/server waterfalls.
assert.match(queueSrc, /Promise\.all/)
assert.match(queueSrc, /Wave 1/)
assert.match(queueSrc, /Wave 2/)

// Must not download full plan text blobs or force-detoast with <> ''.
assert.doesNotMatch(queueSrc, /nutrition_plan, workout_plan/)
assert.doesNotMatch(queueSrc, /\.neq\('nutrition_plan'/)
assert.match(queueSrc, /has_core_content/)

// Prefer coach_id filters over giant client_id IN lists.
assert.match(queueSrc, /\.eq\('coach_id', coachId\)/)
assert.match(queueSrc, /profiles!inner\(coach_id\)/)
assert.doesNotMatch(queueSrc, /\.in\('client_id', clientIds\)/)
assert.doesNotMatch(queueSrc, /\.in\('client_id', pendingPlanClientIds\)/)

// Panel: one API round-trip + hard timeout so loads cannot spin for minutes.
assert.match(panelSrc, /fetch\('\/api\/coach\/work-queue'/)
assert.match(panelSrc, /QUEUE_FETCH_TIMEOUT_MS/)
assert.match(panelSrc, /AbortController/)
assert.match(panelSrc, /Retry/)
assert.doesNotMatch(panelSrc, /getCoachWorkQueue\(/)
assert.doesNotMatch(panelSrc, /requireCoach\(/)

// API uses service role after coach auth (bypass slow RLS EXISTS scans).
assert.match(routeSrc, /createAdminClient/)
assert.match(routeSrc, /getCoachWorkQueue/)
assert.match(routeSrc, /maxDuration/)

// Dashboard must not block the queue on full check-in history.
assert.match(dashSrc, /ROSTER_PREVIEW_LIMIT/)
assert.match(dashSrc, /previewIds/)
assert.match(dashSrc, /Unblock the work queue immediately/)

// Indexes + content flag for queue hot paths.
assert.match(migrationSrc, /checkins_coach_unreviewed_submitted_idx/)
assert.match(migrationSrc, /has_core_content/)
assert.match(migrationSrc, /plans_sync_has_core_content/)

console.log('✓ work queue hang fixes: admin reads, no giant INs, timeout, dashboard unblock')
