/**
 * Verifies promo / referral code helpers.
 * Run: npx tsx scripts/verify-promo-codes.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computePromoDiscountPaise,
  isPromoCodeCurrentlyValid,
  normalizePromoCode,
} from '../src/lib/payments/promo-codes'
import { expectedAmountPaiseFromOrderNotes } from '../src/lib/payments/checkout-discounts'
import { COACHING_PLANS } from '../src/lib/payments/plans'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

assert.equal(normalizePromoCode('  summer 200 '), 'SUMMER200')
pass('normalizes promo codes')

const fixed = computePromoDiscountPaise(
  {
    discount_type: 'fixed',
    discount_paise: 25000,
    discount_percent: 0,
    plan_discounts_paise: {},
    applicable_plans: null,
  },
  '3_months',
  149900
)
assert.equal(fixed, 25000)
pass('computes fixed discount')

const percent = computePromoDiscountPaise(
  {
    discount_type: 'percent',
    discount_paise: 0,
    discount_percent: 10,
    plan_discounts_paise: {},
    applicable_plans: ['6_months'],
  },
  '6_months',
  249900
)
assert.equal(percent, 24990)
pass('computes percent discount for allowed plan')

assert.equal(
  computePromoDiscountPaise(
    {
      discount_type: 'percent',
      discount_paise: 0,
      discount_percent: 10,
      plan_discounts_paise: {},
      applicable_plans: ['6_months'],
    },
    '3_months',
    149900
  ),
  null
)
pass('rejects plan outside allow-list')

assert.equal(
  isPromoCodeCurrentlyValid({
    is_active: true,
    remaining_uses: 2,
    expires_at: null,
  }),
  null
)
pass('active code with uses is valid')

assert.match(
  isPromoCodeCurrentlyValid({
    is_active: true,
    remaining_uses: 0,
    expires_at: null,
  }) ?? '',
  /no uses/i
)
pass('exhausted code is invalid')

const expected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: String(149900 - 20000),
  list_amount_paise: '149900',
  discount_paise: '20000',
  discount_code: 'PARTNER50',
})
assert.equal(expected, 129900)
pass('order notes accept generic promo amounts')

const modules = readFileSync(resolve('src/lib/admin/modules.ts'), 'utf8')
assert.match(modules, /promo-codes/)
assert.match(modules, /Discount & Referral Codes/)
pass('admin nav registers promo codes module')

const migration = readFileSync(
  resolve('supabase/migrations/20260803100000_promo_codes.sql'),
  'utf8'
)
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.promo_codes/)
assert.match(migration, /kind text NOT NULL CHECK \(kind IN \('discount', 'referral'\)\)/)
pass('migration creates promo_codes with discount/referral kinds')

console.log('\nAll promo code checks passed.')
