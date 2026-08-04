/**
 * Verifies membership extension date math helpers via the public stacking rules
 * used by extendClientMembership (duplicated lightly for unit-style checks).
 */

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

function stackBase(existingIso: string | null, nowMs: number): Date {
  const existingMs = existingIso ? new Date(existingIso).getTime() : NaN
  return new Date(Number.isFinite(existingMs) ? Math.max(existingMs, nowMs) : nowMs)
}

function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime())
  next.setMonth(next.getMonth() + months)
  return next
}

const now = Date.parse('2026-08-04T10:00:00.000Z')

const fromExpired = stackBase('2026-06-01T00:00:00.000Z', now)
assert('expired membership stacks from today', fromExpired.getTime() === now)

const fromFuture = stackBase('2026-09-17T00:00:00.000Z', now)
assert(
  'active membership stacks from current end',
  fromFuture.toISOString() === '2026-09-17T00:00:00.000Z'
)

const chiragFix = addMonths(stackBase('2026-09-17T00:00:00.000Z', now), 3)
assert(
  'adding 3 months to Sep 17 yields Dec 17',
  chiragFix.getUTCFullYear() === 2026 &&
    chiragFix.getUTCMonth() === 11 &&
    chiragFix.getUTCDate() === 17
)

const fromNull = stackBase(null, now)
const plusSix = addMonths(fromNull, 6)
assert(
  'null expiry + 6 months from Aug 4 → Feb 4',
  plusSix.getUTCFullYear() === 2027 &&
    plusSix.getUTCMonth() === 1 &&
    plusSix.getUTCDate() === 4
)

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}

console.log('\nAll extend-membership assertions passed')
