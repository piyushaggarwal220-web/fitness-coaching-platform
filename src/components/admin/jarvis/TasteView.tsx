'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import * as s from './styles'

type TastePref = {
  id: string
  dimension: string
  preference_key: string
  preference_value: string
  polarity: string
  confidence: number
  evidence_count: number
  scope: string
  status: string
  influence_mode: string
  signal_kind: string
  explanation: string | null
  last_observed_at: string
  history?: { event: string; at: string; note: string }[]
}

type TasteProfile = {
  preferences: TastePref[]
  candidates: TastePref[]
  conflicts: TastePref[]
  confirmation_asks: {
    preference_id: string
    ask: string
    confidence: number
    evidence_count: number
    dimension: string
    preference_key: string
    preference_value: string
    scope: string
  }[]
  evidence_count: number
  last_updated: string | null
}

export function TasteView() {
  const [profile, setProfile] = useState<TasteProfile | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [explain, setExplain] = useState<{ id: string; text: string; evidence: string[] } | null>(
    null
  )

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/jarvis/taste')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load taste')
    setProfile(json.profile as TasteProfile)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await load()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  async function act(action: 'confirm' | 'reject', preferenceId: string, scope?: string) {
    setBusy(preferenceId)
    try {
      const res = await fetch('/api/admin/jarvis/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, preference_id: preferenceId, scope }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Action failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy('')
    }
  }

  async function showWhy(preferenceId: string) {
    setBusy(preferenceId)
    try {
      const res = await fetch('/api/admin/jarvis/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'explain', preference_id: preferenceId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Explain failed')
      setExplain({
        id: preferenceId,
        text: json.explanation || '',
        evidence: json.evidence_summaries || [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Explain failed')
    } finally {
      setBusy('')
    }
  }

  function PrefCard({
    pref,
    actions,
  }: {
    pref: TastePref
    actions?: boolean
  }) {
    return (
      <div style={{ ...s.card, marginTop: 8 }}>
        <div style={{ fontWeight: 700 }}>
          {pref.dimension} · {pref.preference_key} = {pref.preference_value}
        </div>
        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>
          {pref.explanation || `${pref.polarity} · ${pref.influence_mode}`}
        </div>
        <div
          style={{
            fontSize: 11,
            color: colors.textMuted,
            marginTop: 8,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>CONFIDENCE {Math.round(pref.confidence * 100)}%</span>
          <span>EVIDENCE {pref.evidence_count}</span>
          <span>SCOPE {pref.scope}</span>
          <span>{pref.status}</span>
          <span>{pref.signal_kind}</span>
          <span>LAST {pref.last_observed_at}</span>
        </div>
        {pref.history?.length ? (
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
            HISTORY{' '}
            {pref.history
              .slice(-4)
              .map((h) => h.event)
              .join(' → ')}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" style={s.ghostBtn} onClick={() => void showWhy(pref.id)} disabled={!!busy}>
            Why?
          </button>
          {actions ? (
            <>
              <button
                type="button"
                style={s.solidBtn}
                onClick={() => void act('confirm', pref.id)}
                disabled={!!busy}
              >
                Confirm
              </button>
              <button
                type="button"
                style={s.ghostBtn}
                onClick={() => void act('confirm', pref.id, 'INSTAGRAM_REEL')}
                disabled={!!busy}
              >
                Only for Reels
              </button>
              <button
                type="button"
                style={s.dangerBtn}
                onClick={() => void act('reject', pref.id)}
                disabled={!!busy}
              >
                Reject
              </button>
            </>
          ) : null}
        </div>
        {explain?.id === pref.id ? (
          <div style={{ marginTop: 10, fontSize: 12, color: colors.textSecondary }}>
            <div>{explain.text}</div>
            {explain.evidence.map((e, i) => (
              <div key={i} style={{ marginTop: 4 }}>
                · {e}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
        <div style={{ color: colors.danger }}>{error}</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
        <div style={s.eyebrow}>TASTE ENGINE</div>
        <div>Loading creative preferences…</div>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>PHASE 7 · TASTE ENGINE</div>
      <h2 style={{ margin: '6px 0 8px', fontSize: 24 }}>Creative preferences</h2>
      <p style={{ margin: 0, color: colors.textSecondary, fontSize: 13, maxWidth: 640 }}>
        Evidence-backed production preferences only. Audience performance is labeled separately and never
        auto-converted into user taste. Current instructions always override stored taste.
      </p>
      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
        Evidence events {profile.evidence_count} · Last updated {profile.last_updated || '—'}
      </div>

      {profile.confirmation_asks.length ? (
        <div style={{ marginTop: 20 }}>
          <div style={s.sectionLabel}>CONFIRMATION ASKS</div>
          {profile.confirmation_asks.map((ask) => (
            <div key={ask.preference_id} style={{ ...s.card, marginTop: 8 }}>
              <div style={{ fontSize: 13 }}>{ask.ask}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  style={s.solidBtn}
                  onClick={() => void act('confirm', ask.preference_id)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  style={s.ghostBtn}
                  onClick={() => void act('confirm', ask.preference_id, 'INSTAGRAM_REEL')}
                >
                  Only for Reels
                </button>
                <button
                  type="button"
                  style={s.dangerBtn}
                  onClick={() => void act('reject', ask.preference_id)}
                >
                  No
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <div style={s.sectionLabel}>ACTIVE PREFERENCES</div>
        {profile.preferences.length ? (
          profile.preferences.map((p) => <PrefCard key={p.id} pref={p} />)
        ) : (
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 8 }}>
            No active preferences yet.
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={s.sectionLabel}>CANDIDATES</div>
        {profile.candidates.length ? (
          profile.candidates.map((p) => <PrefCard key={p.id} pref={p} actions />)
        ) : (
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 8 }}>No candidates.</div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={s.sectionLabel}>CONFLICTS</div>
        {profile.conflicts.length ? (
          profile.conflicts.map((p) => <PrefCard key={p.id} pref={p} actions />)
        ) : (
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 8 }}>No conflicts.</div>
        )}
      </div>
    </div>
  )
}
