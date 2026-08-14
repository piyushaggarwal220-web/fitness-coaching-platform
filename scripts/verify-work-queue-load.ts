import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const queueSrc = readFileSync(resolve('src/lib/coach-work-queue.ts'), 'utf8')
const panelSrc = readFileSync(resolve('src/components/coach/CoachWorkQueuePanel.tsx'), 'utf8')
const routeSrc = readFileSync(resolve('src/app/api/coach/work-queue/route.ts'), 'utf8')

// Parallel waves instead of sequential browser/server waterfalls.
assert.match(queueSrc, /Promise\.all/)
assert.match(queueSrc, /Wave 1/)
assert.match(queueSrc, /Wave 2/)

// Must not download full plan text blobs just to check readiness.
assert.doesNotMatch(
  queueSrc,
  /select\('client_id, nutrition_plan, workout_plan'\)/
)
assert.match(queueSrc, /select\('client_id'\)/)
assert.match(queueSrc, /\.neq\('nutrition_plan', ''\)/)
assert.match(queueSrc, /\.neq\('workout_plan', ''\)/)

// Generation jobs scoped to pending plan clients only.
assert.match(queueSrc, /\.in\('client_id', pendingPlanClientIds\)/)

// Panel loads via one API round-trip (not client-side getCoachWorkQueue waterfall).
assert.match(panelSrc, /fetch\('\/api\/coach\/work-queue'/)
assert.doesNotMatch(panelSrc, /getCoachWorkQueue\(/)
assert.doesNotMatch(panelSrc, /requireCoach\(/)

// API route returns tasks + coachId for realtime wiring.
assert.match(routeSrc, /getCoachWorkQueue/)
assert.match(routeSrc, /coachId/)
assert.match(routeSrc, /export async function GET/)

console.log('✓ work queue load path uses parallel queries + single API round-trip')
