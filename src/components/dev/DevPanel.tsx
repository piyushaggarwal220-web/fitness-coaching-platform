'use client'

import { isDevToolkitEnabledClient } from '@/lib/dev-mode'
import { TEST_PASSWORD } from '@/lib/dev-seeds'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useCallback, useState } from 'react'

const supabase = createClient()

type SeedAction =
  | 'ensure_test_client'
  | 'ensure_test_coach'
  | 'create_test_client'
  | 'reset_test_data'

async function runDevAction(action: SeedAction) {
  const res = await fetch('/api/dev/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Dev action failed')
  return json as {
    message: string
    data?: { email?: string; password?: string }
  }
}

export default function DevPanel() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label)
      setStatus(null)
      try {
        await fn()
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Action failed')
      } finally {
        setBusy(null)
      }
    },
    []
  )

  if (!isDevToolkitEnabledClient()) return null

  async function signInAs(email: string, password: string, redirectTo: string) {
    const normalizedEmail = email.trim().toLowerCase()
    await supabase.auth.signOut()
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (error) throw new Error(error.message)

    for (let attempt = 0; attempt < 15; attempt++) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email?.toLowerCase() === normalizedEmail) {
        // Full navigation so middleware and coach guards see the new session
        window.location.assign(redirectTo)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    throw new Error('Sign-in succeeded but session did not update. Please try again.')
  }

  return (
    <div className="dev-panel" data-dev-panel>
      <button
        type="button"
        className="dev-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="dev-panel-menu"
      >
        {open ? '×' : 'DEV'}
      </button>

      {open ? (
        <div id="dev-panel-menu" className="dev-panel__menu" role="dialog" aria-label="Developer shortcuts">
          <p className="dev-panel__title">Developer Panel</p>
          <p className="dev-panel__hint">Development only — not in production builds</p>

          <div className="dev-panel__group">
            <p className="dev-panel__label">Auth</p>
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                run('client', async () => {
                  const json = await runDevAction('ensure_test_client')
                  const email = json.data?.email
                  const password = json.data?.password ?? TEST_PASSWORD
                  if (!email) throw new Error('No client email returned')
                  await signInAs(email, password, '/dashboard')
                  setStatus(`Signed in as ${email}`)
                })
              }
            >
              {busy === 'client' ? '…' : 'Login as Test Client'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                run('coach', async () => {
                  const json = await runDevAction('ensure_test_coach')
                  const email = json.data?.email
                  const password = json.data?.password ?? TEST_PASSWORD
                  if (!email) throw new Error('No coach email returned')
                  await signInAs(email, password, '/coach/dashboard')
                  setStatus(`Signed in as coach ${email}`)
                })
              }
            >
              {busy === 'coach' ? '…' : 'Login as Coach'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                run('create', async () => {
                  const json = await runDevAction('create_test_client')
                  const email = json.data?.email
                  const password = json.data?.password ?? TEST_PASSWORD
                  if (!email) throw new Error('No email returned')
                  await signInAs(email, password, '/onboarding')
                  setStatus(`Created & signed in: ${email}`)
                })
              }
            >
              {busy === 'create' ? '…' : 'Create Test Client'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="dev-panel__danger"
              onClick={() =>
                run('reset', async () => {
                  const json = await runDevAction('reset_test_data')
                  setStatus(json.message)
                })
              }
            >
              {busy === 'reset' ? '…' : 'Reset Test Data'}
            </button>
          </div>

          <div className="dev-panel__group">
            <p className="dev-panel__label">Navigate</p>
            <Link href="/dashboard" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
            <Link href="/onboarding" onClick={() => setOpen(false)}>
              Onboarding
            </Link>
            <Link href="/plan" onClick={() => setOpen(false)}>
              Plans
            </Link>
            <Link href="/checkin" onClick={() => setOpen(false)}>
              Weekly Check-ins
            </Link>
            <Link href="/coach/dashboard" onClick={() => setOpen(false)}>
              Coach Portal
            </Link>
            <Link href="/admin/dev-tools" onClick={() => setOpen(false)}>
              Full Dev Toolkit
            </Link>
          </div>

          {status ? <p className="dev-panel__status">{status}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
