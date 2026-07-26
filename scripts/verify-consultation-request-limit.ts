import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import {
  CONSULTATION_REQUEST_LIMIT,
  consultationQuota,
  isConsultationLimitError,
  validateConsultationRequest,
} from '../src/lib/consultation-requests'

const VALID_KEY = '123e4567-e89b-42d3-a456-426614174000'

assert.equal(CONSULTATION_REQUEST_LIMIT, 2)
assert.deepEqual(consultationQuota(0), { used: 0, remaining: 2 })
assert.deepEqual(consultationQuota(1), { used: 1, remaining: 1 })
assert.deepEqual(consultationQuota(3), { used: 2, remaining: 0 })

const valid = validateConsultationRequest({
  name: '  Piyush   Aggarwal ',
  email: ' PIYUSH@EXAMPLE.COM ',
  phone: '92204 51577',
  idempotencyKey: VALID_KEY,
})
assert.equal(valid.ok, true)
if (valid.ok) {
  assert.equal(valid.value.name, 'Piyush Aggarwal')
  assert.equal(valid.value.email, 'piyush@example.com')
  assert.equal(valid.value.phoneE164, '+919220451577')
}

assert.equal(
  validateConsultationRequest({
    name: 'Piyush Aggarwal',
    email: 'invalid',
    phone: '9220451577',
    idempotencyKey: VALID_KEY,
  }).ok,
  false
)
assert.equal(
  validateConsultationRequest({
    name: 'Piyush Aggarwal',
    email: 'piyush@example.com',
    phone: '123',
    idempotencyKey: VALID_KEY,
  }).ok,
  false
)
assert.equal(
  isConsultationLimitError({
    code: 'P0001',
    message: 'CONSULTATION_REQUEST_LIMIT_REACHED',
  }),
  true
)

const migration = await readFile(
  new URL('../supabase/migrations/20260726151544_limit_consultation_requests.sql', import.meta.url),
  'utf8'
)
assert.match(migration, /pg_advisory_xact_lock/)
assert.match(migration, /request_count >= 2/)
assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
assert.match(migration, /REVOKE ALL ON TABLE public\.consultation_requests FROM anon, authenticated/)
assert.match(migration, /UNIQUE \(idempotency_key\)/)

const browserScript = await readFile(
  new URL('./shopify-talk-to-coach-limit.js', import.meta.url),
  'utf8'
)

type BrowserRun = {
  fetchCalls: Array<{ url: string; body: Record<string, string> }>
  form: {
    dataset: Record<string, string>
    hidden: boolean
    triggerSubmit: () => void
    nativeSubmitCount: () => number
  }
  status: { textContent: string }
  storedCount: () => string | null
}

function runBrowserScript(response: {
  status: number
  ok: boolean
  body: Record<string, unknown>
}, initialCount?: number): BrowserRun {
  const local = new Map<string, string>()
  const session = new Map<string, string>()
  if (initialCount !== undefined) {
    local.set('lurvox-consultation-submissions-v1', String(initialCount))
  }

  const fields = {
    name: { value: 'Piyush Aggarwal', required: false },
    email: { value: 'piyush@example.com', required: false },
    phone: { value: '9220451577', required: false },
    submit: { disabled: false },
  }
  let submitHandler: ((event: { preventDefault: () => void }) => void) | null = null
  let nativeSubmissions = 0
  let status = { textContent: '', style: { cssText: '' }, setAttribute() {} }

  const form = {
    dataset: {} as Record<string, string>,
    hidden: false,
    parentNode: {
      insertBefore(node: typeof status) {
        status = node
      },
    },
    querySelector(selector: string) {
      if (selector === '[name="contact[name]"]') return fields.name
      if (selector === '[name="contact[email]"]') return fields.email
      if (selector === '[name="contact[phone]"]') return fields.phone
      if (selector === '[type="submit"]') return fields.submit
      return null
    },
    addEventListener(type: string, callback: typeof submitHandler) {
      if (type === 'submit') submitHandler = callback
    },
    reportValidity() {
      return true
    },
    requestSubmit() {
      nativeSubmissions += 1
      submitHandler?.({ preventDefault() {} })
    },
  }
  const fetchCalls: BrowserRun['fetchCalls'] = []
  const window = {
    location: { pathname: '/pages/talk-to-a-coach' },
    localStorage: {
      getItem(key: string) {
        return local.get(key) ?? null
      },
      setItem(key: string, value: string) {
        local.set(key, value)
      },
    },
    sessionStorage: {
      getItem(key: string) {
        return session.get(key) ?? null
      },
      setItem(key: string, value: string) {
        session.set(key, value)
      },
      removeItem(key: string) {
        session.delete(key)
      },
    },
    crypto: { randomUUID: () => VALID_KEY },
    fetch(url: string, init: { body: string }) {
      fetchCalls.push({ url, body: JSON.parse(init.body) })
      return Promise.resolve({
        status: response.status,
        ok: response.ok,
        json: () => Promise.resolve(response.body),
      })
    },
  }
  const document = {
    readyState: 'complete',
    querySelector() {
      return form
    },
    createElement() {
      return { textContent: '', style: { cssText: '' }, setAttribute() {} }
    },
    addEventListener() {},
  }

  vm.runInNewContext(browserScript, { window, document, Number, Promise, Uint8Array })

  return {
    fetchCalls,
    form: {
      dataset: form.dataset,
      get hidden() {
        return form.hidden
      },
      triggerSubmit: () => submitHandler?.({ preventDefault() {} }),
      nativeSubmitCount: () => nativeSubmissions,
    },
    status,
    storedCount: () => local.get('lurvox-consultation-submissions-v1') ?? null,
  }
}

async function settlePromises() {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

const accepted = runBrowserScript({
  status: 201,
  ok: true,
  body: { success: true, used: 1, remaining: 1 },
})
accepted.form.triggerSubmit()
await settlePromises()
assert.equal(accepted.fetchCalls.length, 1)
assert.equal(accepted.fetchCalls[0]?.url, 'https://app.lurvox.in/api/consultation-requests')
assert.equal(accepted.fetchCalls[0]?.body.phone, '9220451577')
assert.equal(accepted.storedCount(), '1')
assert.equal(accepted.form.nativeSubmitCount(), 1)

const rejected = runBrowserScript({
  status: 429,
  ok: false,
  body: {
    error: 'You have already used both Talk to a coach submissions.',
    code: 'CONSULTATION_REQUEST_LIMIT',
  },
})
rejected.form.triggerSubmit()
await settlePromises()
assert.equal(rejected.form.hidden, true)
assert.equal(rejected.storedCount(), '2')

const alreadyExhausted = runBrowserScript(
  { status: 201, ok: true, body: { success: true } },
  2
)
assert.equal(alreadyExhausted.form.hidden, true)
assert.equal(alreadyExhausted.fetchCalls.length, 0)

console.log('Consultation request lifetime limit verification passed.')
