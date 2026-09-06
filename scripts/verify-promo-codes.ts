/**
 * Verifies promo / referral code helpers.
 * Run: npx tsx scripts/verify-promo-codes.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  affiliateDiscountPaise,
  affiliateSalePaise,
  getAffiliateCode,
  isAffiliateDiscountCode,
} from '../src/lib/payments/affiliate-codes'
import {
  computePromoDiscountPaise,
  isPromoCodeCurrentlyValid,
  normalizePromoCode,
} from '../src/lib/payments/promo-codes'
import {
  expectedAmountPaiseFromOrderNotes,
  isRetiredPublicDiscountCode,
  isPublicSaleCode,
  publicSaleDiscountPaise,
} from '../src/lib/payments/checkout-discounts'
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
  349900
)
assert.equal(percent, 34990)
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

const list3 = COACHING_PLANS['3_months'].amountPaise
const expected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: String(list3 - 20000),
  list_amount_paise: String(list3),
  discount_paise: '20000',
  discount_code: 'PARTNER50',
})
assert.equal(expected, list3 - 20000)
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

assert.equal(isRetiredPublicDiscountCode('welcome60'), true)
assert.equal(isRetiredPublicDiscountCode('SUMMER60'), false)
assert.equal(isRetiredPublicDiscountCode('LUKE'), false)
assert.equal(isPublicSaleCode('summer60'), true)
assert.equal(publicSaleDiscountPaise(199900), 119900)
assert.equal(publicSaleDiscountPaise(349900), 209900)
assert.equal(publicSaleDiscountPaise(599900), 359900)
pass('WELCOME60 is retired; SUMMER60 is the public 60% sale')

const summerExpected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: '80000',
  list_amount_paise: '199900',
  discount_paise: '119900',
  discount_code: 'SUMMER60',
})
assert.equal(summerExpected, 80000)
pass('order notes accept SUMMER60 public sale amounts')

assert.equal(isAffiliateDiscountCode('luke'), true)
assert.equal(getAffiliateCode('LUKE')?.extraPercentOffSale, 5)
assert.equal(affiliateSalePaise('LUKE', '3_months'), 189900)
assert.equal(affiliateSalePaise('LUKE', '6_months'), 332400)
assert.equal(affiliateSalePaise('LUKE', '12_months'), 569900)
assert.equal(affiliateDiscountPaise('LUKE', '3_months', 199900), 10000)
assert.equal(affiliateDiscountPaise('LUKE', '6_months', 349900), 17500)
assert.equal(affiliateDiscountPaise('LUKE', '12_months', 599900), 30000)
pass('LUKE affiliate code is catalog price + 5% (₹1,899 / ₹3,324 / ₹5,699)')

const lukeExpected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: '189900',
  list_amount_paise: '199900',
  discount_paise: '10000',
  discount_code: 'LUKE',
})
assert.equal(lukeExpected, 189900)
pass('order notes accept LUKE affiliate amounts')

const lukeMigration = readFileSync(
  resolve('supabase/migrations/20260809180000_luke_affiliate_promo.sql'),
  'utf8'
)
assert.match(lukeMigration, /'LUKE'/)
assert.match(lukeMigration, /referral/)
pass('migration seeds LUKE affiliate promo')

console.log('\nAll promo code checks passed.')
