'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { CredentialDisplay } from '@/components/admin/CredentialDisplay'
import { adminStyles as s } from '@/lib/admin/styles'
import { FITNESS_GOAL_OPTIONS } from '@/lib/onboarding'
import {
  generateSecurePassword,
  type CreatedAccountCredentials,
} from '@/lib/admin/testing-accounts'
import type { TrialClientSummary } from '@/lib/admin/trial-client-guard'
import { getPortalLoginUrls } from '@/lib/admin/portal-urls'

const RESET_CONFIRM_MESSAGE =
  'Reset this trial client? This will permanently remove all coaching data, plans, check-ins, and progress for this account.'

type CoachOption = { id: string; name: string | null; user_id: string }

type BusyAction =
  | 'client'
  | 'coach'
  | 'reset'
  | 'password'
  | 'fake'
  | null

export default function TestingToolsClient() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [coaches, setCoaches] = useState<CoachOption[]>([])
  const [trialClients, setTrialClients] = useState<TrialClientSummary[]>([])
  const [busy, setBusy] = useState<BusyAction>(null)
  const [lastAccount, setLastAccount] = useState<CreatedAccountCredentials | null>(null)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [fakeCoachId, setFakeCoachId] = useState('')

  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    password: generateSecurePassword(),
    fitnessGoal: '',
    coachId: '',
  })

  const [coachForm, setCoachForm] = useState({
    name: '',
    email: '',
    password: generateSecurePassword(),
  })

  const portalUrls = getPortalLoginUrls()

  const loadCoaches = useCallback(async () => {
    const res = await fetch('/api/admin/testing-tools/coaches')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to load coaches')
    setCoaches(json.coaches ?? [])
  }, [])

  const loadTrialClients = useCallback(async () => {
    const res = await fetch('/api/admin/testing-tools/trial-clients')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to load trial clients')
    const clients = (json.clients ?? []) as TrialClientSummary[]
    setTrialClients(clients)
    setSelectedClientId((current) => current || clients[0]?.id || '')
  }, [])

  useEffect(() => {
    const init = async () => {
      setError('')

      try {
        await Promise.all([loadCoaches(), loadTrialClients()])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load testing tools')
      }

      setLoading(false)
    }

    void init()
  }, [loadCoaches, loadTrialClients])

  const refreshLists = async () => {
    await Promise.all([loadCoaches(), loadTrialClients()])
  }

  const createTrialClient = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy('client')
    setError('')
    setLastAccount(null)

    try {
      const res = await fetch('/api/admin/testing-tools/trial-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clientForm.name,
          email: clientForm.email,
          password: clientForm.password,
          fitnessGoal: clientForm.fitnessGoal || null,
          coachId: clientForm.coachId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create trial client')

      setLastAccount(json.account as CreatedAccountCredentials)
      setClientForm((prev) => ({
        ...prev,
        name: '',
        email: '',
        password: generateSecurePassword(),
        fitnessGoal: '',
        coachId: '',
      }))
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trial client')
    } finally {
      setBusy(null)
    }
  }

  const createTrialCoach = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy('coach')
    setError('')
    setLastAccount(null)

    try {
      const res = await fetch('/api/admin/testing-tools/trial-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coachForm),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create trial coach')

      setLastAccount(json.account as CreatedAccountCredentials)
      setCoachForm({
        name: '',
        email: '',
        password: generateSecurePassword(),
      })
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trial coach')
    } finally {
      setBusy(null)
    }
  }

  const generateFakeClient = async () => {
    setBusy('fake')
    setError('')
    setLastAccount(null)

    try {
      const res = await fetch('/api/admin/testing-tools/fake-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: fakeCoachId || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to generate fake client')

      setLastAccount(json.account as CreatedAccountCredentials)
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate fake client')
    } finally {
      setBusy(null)
    }
  }

  const resetTrialClient = async () => {
    if (!selectedClientId) {
      setError('Select a trial client to reset.')
      return
    }

    if (!window.confirm(RESET_CONFIRM_MESSAGE)) return

    setBusy('reset')
    setError('')
    setLastAccount(null)

    try {
      const res = await fetch('/api/admin/testing-tools/reset-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to reset trial client')

      const client = trialClients.find((c) => c.id === selectedClientId)
      setLastAccount({
        userId: selectedClientId,
        clientId: selectedClientId,
        email: client?.email ?? '',
        password: '(unchanged — use Reset Password if needed)',
        role: 'client',
        loginUrl: portalUrls.client,
        created: false,
        message: json.result?.message ?? 'Trial client reset.',
      })
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset trial client')
    } finally {
      setBusy(null)
    }
  }

  const resetClientPassword = async () => {
    if (!selectedClientId) {
      setError('Select a trial client first.')
      return
    }

    setBusy('password')
    setError('')

    try {
      const res = await fetch('/api/admin/testing-tools/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountType: 'client', accountId: selectedClientId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to reset password')

      setLastAccount(json.account as CreatedAccountCredentials)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading testing tools…</div>
      </>
    )
  }

  const selectedClient = trialClients.find((client) => client.id === selectedClientId)

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.container}>
          <h1 style={s.title}>Testing Tools</h1>
          <p style={s.subtitle}>
            Internal QA and demo account creation. Trial clients bypass payment and receive full platform access.
          </p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.card}>
            <h2 style={s.cardTitle}>Portal URLs</h2>
            <ul style={listStyle}>
              <li>Admin Login: {portalUrls.admin}</li>
              <li>Coach Login: {portalUrls.coach}</li>
              <li>Client Login: {portalUrls.client}</li>
            </ul>
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Trial Client Management</h2>
            <p style={helperText}>
              Reset coaching data for reusable trial accounts. Only clients with{' '}
              <code>access_source = admin_trial</code> can be reset.
            </p>

            <Field label="Trial client">
              <select
                style={inputStyle}
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                {trialClients.length === 0 ? (
                  <option value="">No trial clients yet</option>
                ) : (
                  trialClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name ?? 'Unnamed'} ({client.email ?? client.id})
                      {client.onboarding_complete ? ' — onboarded' : ' — fresh'}
                    </option>
                  ))
                )}
              </select>
            </Field>

            {selectedClient && (
              <p style={metaText}>
                Onboarding: {selectedClient.onboarding_complete ? 'Complete' : 'Not started'} · Plan
                delivered: {selectedClient.plan_delivered ? 'Yes' : 'No'}
              </p>
            )}

            <div style={actionRow}>
              <button
                type="button"
                style={dangerBtn}
                onClick={() => void resetTrialClient()}
                disabled={!selectedClientId || busy === 'reset'}
              >
                {busy === 'reset' ? 'Resetting…' : 'Reset Trial Client'}
              </button>
              <button
                type="button"
                style={secondaryBtn}
                onClick={() => void resetClientPassword()}
                disabled={!selectedClientId || busy === 'password'}
              >
                {busy === 'password' ? 'Resetting…' : 'Reset Password'}
              </button>
            </div>
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Generate Fake Client</h2>
            <p style={helperText}>
              Instantly creates a trial client with realistic randomized onboarding data — ready for AI
              plans and weekly check-ins.
            </p>
            <Field label="Coach Assignment (optional)">
              <select
                style={inputStyle}
                value={fakeCoachId}
                onChange={(e) => setFakeCoachId(e.target.value)}
              >
                <option value="">— No coach —</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name ?? coach.id}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              style={primaryBtn}
              onClick={() => void generateFakeClient()}
              disabled={busy === 'fake'}
            >
              {busy === 'fake' ? 'Generating…' : 'Generate Fake Client'}
            </button>
          </div>

          <div style={gridStyle}>
            <div style={s.card}>
              <h2 style={s.cardTitle}>Create Trial Client</h2>
              <p style={helperText}>
                Creates auth user, profile, and grants access via <code>access_source = admin_trial</code>.
              </p>
              <form onSubmit={(e) => void createTrialClient(e)} style={formStyle}>
                <Field label="Full Name" required>
                  <input
                    style={inputStyle}
                    value={clientForm.name}
                    onChange={(e) => setClientForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    type="email"
                    style={inputStyle}
                    value={clientForm.email}
                    onChange={(e) => setClientForm((p) => ({ ...p, email: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Password" required>
                  <div style={passwordRow}>
                    <input
                      type="text"
                      style={{ ...inputStyle, flex: 1 }}
                      value={clientForm.password}
                      onChange={(e) => setClientForm((p) => ({ ...p, password: e.target.value }))}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      style={secondaryBtn}
                      onClick={() =>
                        setClientForm((p) => ({ ...p, password: generateSecurePassword() }))
                      }
                    >
                      Generate
                    </button>
                  </div>
                </Field>
                <Field label="Goal (optional)">
                  <select
                    style={inputStyle}
                    value={clientForm.fitnessGoal}
                    onChange={(e) => setClientForm((p) => ({ ...p, fitnessGoal: e.target.value }))}
                  >
                    <option value="">— Select goal —</option>
                    {FITNESS_GOAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Coach Assignment (optional)">
                  <select
                    style={inputStyle}
                    value={clientForm.coachId}
                    onChange={(e) => setClientForm((p) => ({ ...p, coachId: e.target.value }))}
                  >
                    <option value="">— No coach —</option>
                    {coaches.map((coach) => (
                      <option key={coach.id} value={coach.id}>
                        {coach.name ?? coach.id}
                      </option>
                    ))}
                  </select>
                </Field>
                <button type="submit" style={primaryBtn} disabled={busy === 'client'}>
                  {busy === 'client' ? 'Creating…' : 'Create Trial Client'}
                </button>
              </form>
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>Create Trial Coach</h2>
              <p style={helperText}>Creates auth user, profile, and coach record for immediate portal access.</p>
              <form onSubmit={(e) => void createTrialCoach(e)} style={formStyle}>
                <Field label="Full Name" required>
                  <input
                    style={inputStyle}
                    value={coachForm.name}
                    onChange={(e) => setCoachForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    type="email"
                    style={inputStyle}
                    value={coachForm.email}
                    onChange={(e) => setCoachForm((p) => ({ ...p, email: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Password" required>
                  <div style={passwordRow}>
                    <input
                      type="text"
                      style={{ ...inputStyle, flex: 1 }}
                      value={coachForm.password}
                      onChange={(e) => setCoachForm((p) => ({ ...p, password: e.target.value }))}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      style={secondaryBtn}
                      onClick={() =>
                        setCoachForm((p) => ({ ...p, password: generateSecurePassword() }))
                      }
                    >
                      Generate
                    </button>
                  </div>
                </Field>
                <button type="submit" style={primaryBtn} disabled={busy === 'coach'}>
                  {busy === 'coach' ? 'Creating…' : 'Create Trial Coach'}
                </button>
              </form>
            </div>
          </div>

          {lastAccount && (
            <CredentialDisplay account={lastAccount} onDismiss={() => setLastAccount(null)} />
          )}
        </div>
      </div>
    </>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 20,
  marginTop: 20,
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 12,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 14,
}

const passwordRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
}

const primaryBtn: React.CSSProperties = {
  marginTop: 4,
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  backgroundColor: '#7c3aed',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
}

const dangerBtn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  backgroundColor: '#dc2626',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
}

const actionRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 8,
}

const helperText: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  color: '#6b7280',
}

const metaText: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 13,
  color: '#4b5563',
}

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  lineHeight: 1.8,
  fontSize: 14,
}
