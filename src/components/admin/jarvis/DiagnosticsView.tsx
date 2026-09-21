'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import type { JarvisCommandState } from './use-jarvis-command'
import * as s from './styles'

type HealthRow = {
  id: string
  name: string
  status: string
  summary: string
}

type IncidentRow = {
  id: string
  incident_id: string
  detected_at: string
  system: string
  symptom: string
  root_cause?: string | null
  proposed_fix?: unknown
  status: string
  risk_level?: string
  resolution?: string | null
  evidence?: unknown
  approval_id?: string | null
  data_status?: string | null
}

type RunRow = {
  id: string
  status: string
  problem: string
  created_at: string
  budget_exhausted?: boolean
}

type TestRow = {
  id: string
  name: string
  assertion: string
  system: string
  status: string
}

type DiagnosticsPayload = {
  health?: HealthRow[]
  incidents?: IncidentRow[]
  runs?: RunRow[]
  regression_tests?: TestRow[]
  active?: IncidentRow[]
  resolved?: IncidentRow[]
  failed?: IncidentRow[]
}

type Tab = 'health' | 'active' | 'failed' | 'running' | 'resolved' | 'tests'

function tone(status: string): 'ok' | 'warn' | 'danger' | 'muted' {
  const v = status.toLowerCase()
  if (['healthy', 'pass', 'passing', 'resolved', 'verified'].includes(v)) return 'ok'
  if (['degraded', 'partial', 'awaiting_approval', 'diagnosed'].includes(v)) return 'warn'
  if (['failed', 'fail', 'budget_exhausted', 'error'].includes(v)) return 'danger'
  return 'muted'
}

function asFixList(value: unknown): { title?: string; description?: string; risk?: string; test_plan?: string[] }[] {
  return Array.isArray(value) ? (value as { title?: string; description?: string; risk?: string; test_plan?: string[] }[]) : []
}

export function DiagnosticsView({ jarvis }: { jarvis: JarvisCommandState }) {
  const [tab, setTab] = useState<Tab>('health')
  const [data, setData] = useState<DiagnosticsPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<IncidentRow | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/jarvis/diagnostics')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load diagnostics')
    setData(json.diagnostics as DiagnosticsPayload)
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load diagnostics'))
  }, [load])

  async function run(action: 'self_test' | 'diagnose' | 'health') {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/jarvis/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          problem:
            action === 'diagnose'
              ? 'Why is Shopify revenue showing zero for the last 2 days?'
              : undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Diagnostic action failed')
      await load()
      await jarvis.loadDashboard()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Diagnostic action failed')
    } finally {
      setBusy(false)
    }
  }

  async function decide(approvalId: string, approve: boolean) {
    setBusy(true)
    try {
      await jarvis.decide(approvalId, approve)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed')
    } finally {
      setBusy(false)
    }
  }

  const tabs: { id: Tab; label: string; count?: number }[] = useMemo(
    () => [
      { id: 'health', label: 'System Health' },
      { id: 'active', label: 'Active Incidents', count: data?.active?.length },
      { id: 'failed', label: 'Recent Failures', count: data?.failed?.length },
      { id: 'running', label: 'Running Diagnostics', count: data?.runs?.filter((r) => r.status === 'running').length },
      { id: 'resolved', label: 'Resolved Incidents', count: data?.resolved?.length },
      { id: 'tests', label: 'Regression Tests', count: data?.regression_tests?.length },
    ],
    [data]
  )

  const incidents =
    tab === 'active' ? data?.active ?? [] : tab === 'failed' ? data?.failed ?? [] : tab === 'resolved' ? data?.resolved ?? [] : []

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20 }}>
      <div style={s.eyebrow}>DIAGNOSTICS</div>
      <h1 style={{ margin: '6px 0 8px', fontSize: 24, letterSpacing: '-0.03em' }}>Self-diagnostic operator</h1>
      <p style={{ ...s.muted, marginBottom: 16, maxWidth: 720 }}>
        Jarvis can investigate automatically. Significant remediations — source, schema, credentials, permissions, Meta
        campaigns, Shopify writes, deploys — stay locked until you approve. Failures are never shown as ₹0.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" style={s.primaryBtn} disabled={busy} onClick={() => void run('self_test')}>
          Run self-test
        </button>
        <button type="button" style={s.ghostBtn} disabled={busy} onClick={() => void run('diagnose')}>
          Diagnose Shopify last 2 days
        </button>
        <button type="button" style={s.ghostBtn} disabled={busy} onClick={() => void run('health')}>
          Refresh health
        </button>
      </div>

      {error ? (
        <div style={{ ...s.card, borderColor: colors.danger, color: colors.danger, marginBottom: 12 }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            style={{
              ...s.ghostBtn,
              borderColor: tab === t.id ? '#FF6200' : undefined,
              color: tab === t.id ? colors.textPrimary : undefined,
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'health' ? (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {(data?.health ?? []).map((row) => (
            <div key={row.id} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{row.name}</strong>
                <span style={s.badge(tone(row.status))}>{row.status}</span>
              </div>
              <div style={s.muted}>{row.summary}</div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'running' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {(data?.runs ?? []).length === 0 ? <div style={s.muted}>No diagnostic runs stored yet.</div> : null}
          {(data?.runs ?? []).map((run) => (
            <div key={run.id} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{run.problem}</strong>
                <span style={s.badge(tone(run.status))}>{run.status}</span>
              </div>
              <div style={s.muted}>{run.created_at}</div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'tests' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {(data?.regression_tests ?? []).length === 0 ? (
            <div style={s.muted}>No regression tests generated yet.</div>
          ) : null}
          {(data?.regression_tests ?? []).map((test) => (
            <div key={test.id} style={s.card}>
              <div style={{ fontWeight: 700 }}>{test.name}</div>
              <div style={s.muted}>{test.assertion}</div>
              <div style={{ marginTop: 8 }}>
                <span style={s.badge(tone(test.status))}>{test.status}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'active' || tab === 'failed' || tab === 'resolved' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {incidents.length === 0 ? <div style={s.muted}>No incidents in this view.</div> : null}
          {incidents.map((incident) => {
            const fixes = asFixList(incident.proposed_fix)
            const open = selected?.id === incident.id
            return (
              <div key={incident.id} style={s.card}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'inherit', textAlign: 'left', width: '100%', cursor: 'pointer', padding: 0 }}
                  onClick={() => setSelected(open ? null : incident)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={s.eyebrow}>{incident.incident_id}</div>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>{incident.symptom}</div>
                    </div>
                    <span style={s.badge(tone(incident.status))}>{incident.status}</span>
                  </div>
                </button>
                {open ? (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 13, color: colors.textSecondary }}>
                    <div>
                      <div style={s.eyebrow}>SYMPTOM</div>
                      {incident.symptom}
                    </div>
                    <div>
                      <div style={s.eyebrow}>ROOT CAUSE</div>
                      {incident.root_cause || 'Still investigating'}
                    </div>
                    <div>
                      <div style={s.eyebrow}>EVIDENCE</div>
                      {Array.isArray(incident.evidence)
                        ? incident.evidence
                            .slice(0, 6)
                            .map((item) => {
                              const rec = item as { observation?: string }
                              return rec.observation || JSON.stringify(item).slice(0, 180)
                            })
                            .join('\n')
                        : 'None stored'}
                    </div>
                    {fixes.map((fix) => (
                      <div key={fix.title}>
                        <div style={s.eyebrow}>PROPOSED FIX</div>
                        <div>{fix.title}</div>
                        <div style={s.muted}>{fix.description}</div>
                        <div style={{ marginTop: 6 }}>
                          <span style={s.badge(tone(fix.risk || 'medium'))}>RISK {fix.risk || 'medium'}</span>
                        </div>
                        {fix.test_plan?.length ? (
                          <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                            {fix.test_plan.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        ) : null}
                      </div>
                    ))}
                    <div>
                      <div style={s.eyebrow}>STATUS</div>
                      {incident.status}
                      {incident.data_status ? ` · data_status ${incident.data_status}` : ''}
                    </div>
                    {incident.approval_id && incident.status === 'awaiting_approval' ? (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          style={s.primaryBtn}
                          disabled={busy}
                          onClick={() => void decide(incident.approval_id!, true)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          style={s.ghostBtn}
                          disabled={busy}
                          onClick={() => void decide(incident.approval_id!, false)}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
