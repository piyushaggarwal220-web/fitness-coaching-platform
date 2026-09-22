/**
 * Quick validation for pre-pay checkout basics (no DB).
 * Run: npx tsx scripts/verify-checkout-intake-basics.ts
 */
import { validateCheckoutBasicsPayload } from '../src/lib/payments/checkout-intake-basics-shared'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const valid = validateCheckoutBasicsPayload({
  verificationId: '00000000-0000-4000-8000-000000000001',
  email: 'Test@Example.com',
  phone: '+919876543210',
  planSlug: '3_months',
  age: 28,
  gender: 'male',
  heightCm: 172,
  weightKg: 70,
  dietPreference: 'vegetarian',
  mainGoal: 'lose_fat',
})

assert(valid.ok, 'expected valid payload')
if (valid.ok) {
  assert(valid.value.email === 'test@example.com', 'email should normalize')
  assert(valid.value.mainGoal === 'lose_fat', 'main goal')
}

const invalid = validateCheckoutBasicsPayload({
  verificationId: '',
  email: 'bad',
  phone: '',
  planSlug: 'nope',
  age: 5,
  gender: '',
  heightCm: 50,
  dietPreference: '',
  mainGoal: '',
})

assert(!invalid.ok, 'expected invalid payload')
if (!invalid.ok) {
  assert(invalid.missing.length >= 4, 'expected multiple missing fields')
}

console.log('verify-checkout-intake-basics: ok')
