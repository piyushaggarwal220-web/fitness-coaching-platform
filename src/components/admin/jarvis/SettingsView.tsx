'use client'

import { useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { AUTONOMY_LEVELS, formatUsd } from '@/lib/jarvis/operator-present'
import * as s from './styles'

type SettingsPayload = {
  cost?: Record<string, unknown>
  budgets?: Record<string, number | boolean>
  autonomy_level?: number
  live_meta_execution?: boolean
}

type ExecutionStatus = {
  kill_switch?: boolean
  mode?: string
  dry_run?: boolean
  shadow_mode?: boolean
  note?: string
  live_meta_execution?: boolean
  live_instagram_publishing?: boolean
  limits?: Record<string, number>
}

type ReceiptSummary = {
  id: string
  tool_name: string
  system: string
  status: string
  policy_decision?: string | null
  verification_status?: string | null
  dry_run?: boolean
  created_at?: string
}

export function SettingsView() {
  const [data, setData] = useState<SettingsPayload | null>(null)
  const [draft, setDraft] = useState<Record<string, number | boolean>>({})
  const [autonomy, setAutonomy] = useState(2)
  const [confirmHigh, setConfirmHigh] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [execution, setExecution] = useState<ExecutionStatus | null>(null)
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([])
  const [incidents, setIncidents] = useState<{ id: string; tool_name: string; message: string; error_class: string }[]>(
    []
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/jarvis/settings')
        const json = await res.json()
        if (cancelled) return
        if (!json.success) throw new Error(json.error || 'Failed to load settings')
        setData(json)
        setDraft(json.budgets ?? {})
        setAutonomy(json.autonomy_level ?? 2)
        const ex = await fetch('/api/admin/jarvis/execution')
        const exJson = await ex.json()
        if (!cancelled && exJson.success) {
          setExecution(exJson.execution)
          setReceipts(exJson.receipts ?? [])
          setIncidents(exJson.incidents ?? [])
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveExecution(patch: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/jarvis/execution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_controls', ...patch }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed')
      setExecution(json.execution)
      setSaved('Execution controls updated (admin only — Jarvis cannot change these via tools).')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const res = await fetch('/api/admin/jarvis/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          autonomy_level: autonomy,
          confirm_high_autonomy: confirmHigh,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Save failed')
      setData(json)
      setDraft(json.budgets ?? {})
      setAutonomy(json.autonomy_level ?? 2)
      setSaved('Settings saved. Jarvis cannot raise these limits itself.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const cost = data?.cost ?? {}
  const fields: { key: string; label: string }[] = [
    { key: 'daily_ai_budget_usd', label: 'Daily AI budget (USD)' },
    { key: 'monthly_ai_budget_usd', label: 'Monthly AI budget (USD)' },
    { key: 'per_task_budget_usd', label: 'Per-task budget (USD)' },
    { key: 'per_chat_budget_usd', label: 'Per-chat budget (USD)' },
    { key: 'per_research_budget_usd', label: 'Research budget (USD)' },
    { key: 'max_tokens_per_task', label: 'Max tokens' },
    { key: 'max_tool_calls_per_task', label: 'Max tool calls' },
    { key: 'max_searches_per_research', label: 'Max searches' },
    { key: 'max_runtime_minutes', label: 'Max runtime (minutes)' },
  ]

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>SETTINGS</div>
      <h2 style={{ margin: '6px 0 8px', fontSize: 24 }}>Operator controls</h2>
      <p style={{ ...s.muted, marginBottom: 16 }}>
        These limits are owner-only. Jarvis has no tool that can raise its own budget or disable audit.
      </p>
      {error ? <div style={{ color: colors.danger, marginBottom: 10 }}>{error}</div> : null}
      {saved ? <div style={{ color: colors.success, marginBottom: 10 }}>{saved}</div> : null}

      <section style={{ ...s.card, marginBottom: 16 }}>
        <div style={s.eyebrow}>AUTONOMY</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {AUTONOMY_LEVELS.map((level) => (
            <label
              key={level.level}
              style={{
                display: 'flex',
                gap: 10,
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${autonomy === level.level ? s.accent : colors.borderSubtle}`,
                background: autonomy === level.level ? 'rgba(255,98,0,0.08)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="autonomy"
                checked={autonomy === level.level}
                onChange={() => setAutonomy(level.level)}
              />
              <span>
                <strong>
                  Level {level.level} · {level.title}
                </strong>
                <div style={s.muted}>{level.description}</div>
              </span>
            </label>
          ))}
        </div>
        {autonomy >= 3 ? (
          <label style={{ display: 'flex', gap: 8, marginTop: 12, fontSize: 13 }}>
            <input type="checkbox" checked={confirmHigh} onChange={(e) => setConfirmHigh(e.target.checked)} />
            I understand levels 3–4 increase autonomy. Live Meta execution stays off unless enabled separately.
          </label>
        ) : null}
      </section>

      <section style={{ ...s.card, marginBottom: 16 }}>
        <div style={s.eyebrow}>EXECUTION CONTROLS (PHASE 12)</div>
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: colors.textSecondary }}>
          Kill switch: {execution?.kill_switch ? 'ACTIVE — writes stopped' : 'OFF'}
          <br />
          Mode: {execution?.mode || 'approval'}
          {execution?.dry_run ? ' · DRY RUN' : ''}
          {execution?.shadow_mode ? ' · SHADOW' : ''}
          <br />
          Live Meta: {execution?.live_meta_execution ? 'ON' : 'OFF'} · Live Instagram publish:{' '}
          {execution?.live_instagram_publishing ? 'ON' : 'OFF'}
          <div style={{ ...s.muted, marginTop: 6 }}>{execution?.note}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            style={s.ghostBtn}
            disabled={busy}
            onClick={() => void saveExecution({ kill_switch: !execution?.kill_switch })}
          >
            {execution?.kill_switch ? 'Clear kill switch' : 'Engage kill switch'}
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            disabled={busy}
            onClick={() => void saveExecution({ dry_run: !execution?.dry_run })}
          >
            Toggle dry-run
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            disabled={busy}
            onClick={() => void saveExecution({ shadow_mode: !execution?.shadow_mode })}
          >
            Toggle shadow
          </button>
        </div>
      </section>

      <section style={{ ...s.card, marginBottom: 16 }}>
        <div style={s.eyebrow}>RECENT EXECUTIONS</div>
        {receipts.length === 0 ? (
          <div style={{ ...s.muted, marginTop: 10 }}>No execution receipts yet.</div>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {receipts.slice(0, 12).map((r) => (
              <div key={r.id} style={{ fontSize: 12, color: colors.textSecondary }}>
                <strong style={{ color: colors.textPrimary }}>{r.tool_name}</strong> · {r.system} · {r.status}
                {r.policy_decision ? ` · ${r.policy_decision}` : ''}
                {r.verification_status ? ` · verify:${r.verification_status}` : ''}
                {r.dry_run ? ' · DRY_RUN' : ''}
              </div>
            ))}
          </div>
        )}
        {incidents.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div style={s.muted}>Open execution incidents</div>
            {incidents.slice(0, 5).map((i) => (
              <div key={i.id} style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>
                {i.error_class}: {i.tool_name} — {i.message.slice(0, 120)}
              </div>
            ))}
          </div>
        ) : null}
        {execution?.limits ? (
          <div style={{ ...s.muted, marginTop: 10, fontSize: 11 }}>
            Caps: ${execution.limits.max_auto_action_cost_usd}/action · $
            {execution.limits.max_auto_daily_action_cost_usd}/day · {execution.limits.max_auto_actions_per_day}
            /day actions
          </div>
        ) : null}
      </section>

      <section style={{ ...s.card, marginBottom: 16 }}>
        <div style={s.eyebrow}>USAGE VS LIMITS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <div style={s.muted}>Today</div>
            <div style={{ fontWeight: 700 }}>
              {formatUsd(Number(cost.daily_spent_usd ?? 0), 4)} / {formatUsd(Number(cost.daily_limit_usd ?? 0))}
            </div>
          </div>
          <div>
            <div style={s.muted}>This month</div>
            <div style={{ fontWeight: 700 }}>
              {formatUsd(Number(cost.monthly_spent_usd ?? 0), 4)} / {formatUsd(Number(cost.monthly_limit_usd ?? 0))}
            </div>
          </div>
        </div>
        {cost.paused ? (
          <div style={{ color: colors.warning, marginTop: 8, fontSize: 13 }}>
            Autonomous AI work is paused because the daily budget is exhausted.
          </div>
        ) : null}
      </section>

      <section style={s.card}>
        <div style={s.eyebrow}>COST LIMITS</div>
        {fields.map((f) => (
          <label key={f.key} style={{ display: 'block', marginTop: 10, fontSize: 12, color: colors.textMuted }}>
            {f.label}
            <input
              style={{ ...s.input, marginTop: 4 }}
              type="number"
              min={0}
              step={f.key.includes('budget') ? '0.01' : '1'}
              value={Number(draft[f.key] ?? 0)}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label style={{ display: 'flex', gap: 8, marginTop: 12, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={Boolean(draft.background_enabled)}
            onChange={(e) => setDraft({ ...draft, background_enabled: e.target.checked })}
          />
          Background cycle enabled
        </label>
        <div style={{ ...s.muted, marginTop: 10 }}>
          Live Meta execution: {data?.live_meta_execution ? 'ON' : 'OFF'} (not controllable here).
        </div>
        <button type="button" style={{ ...s.primaryBtn, marginTop: 14 }} disabled={busy} onClick={() => void save()}>
          Save settings
        </button>
      </section>
    </div>
  )
}
