'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CoachShell } from '@/components/ui/CoachShell'
import { CoachSectionHeader } from '@/components/coach/CoachSectionHeader'
import { coachPageStyles } from '@/lib/coach-page-styles'
import { colors } from '@/lib/coach-theme'
import { brandTitle } from '@/lib/brand'
import { scoreRowForShowcase, type TransformationScoreRow } from '@/lib/transformation-scores'

const gradeColor: Record<string, string> = {
  A: '#16a34a',
  B: '#2563eb',
  C: '#ca8a04',
  D: '#71717a',
}

export default function CoachTransformationsPage() {
  const [scores, setScores] = useState<TransformationScoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const load = async () => {
    setError('')
    const res = await fetch('/api/coach/transformation-scores')
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to load transformation scores.')
      setLoading(false)
      return
    }
    setScores((data.scores as TransformationScoreRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const nominate = async (row: TransformationScoreRow) => {
    setBusyId(row.clientId)
    setMessage('')
    const quote = window.prompt('Optional quote from the client (or leave blank):') ?? ''
    const res = await fetch('/api/coach/transformation-showcases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: row.clientId, quote }),
    })
    const data = await res.json()
    setBusyId(null)
    if (!res.ok) {
      setMessage(data.error ?? 'Could not nominate client.')
      return
    }
    setMessage(`${row.name ?? 'Client'} nominated for marketing review.`)
    void load()
  }

  return (
    <CoachShell loading={loading} loadingMessage="Loading transformation scores…">
      <CoachSectionHeader
        title={brandTitle('Client transformations')}
        subtitle="Ranked by body change, consistency, photos, and time on plan. Nominate strong results for the website — clients must consent in Settings first."
      />
      {error && <p style={{ color: colors.danger, marginBottom: 12 }}>{error}</p>}
      {message && <p style={{ color: colors.success, marginBottom: 12 }}>{message}</p>}
      {scores.length === 0 ? (
        <p style={{ color: colors.textMuted }}>No scored clients yet. Scores appear after weekly check-ins and progress photos.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {scores.map((row) => {
            const canNominate = scoreRowForShowcase(row) && !row.showcaseStatus && row.marketingPhotoConsent
            return (
              <div key={row.clientId} style={coachPageStyles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 17 }}>{row.name || 'Unnamed'}</strong>
                    <div style={{ marginTop: 6, fontSize: 13, color: colors.textMuted }}>
                      Weight {row.weightStart ?? '—'} → {row.weightLatest ?? '—'}
                      {row.weightChangeKg != null ? ` (${row.weightChangeKg > 0 ? '+' : ''}${row.weightChangeKg} kg)` : ''}
                      {' · '}
                      {row.checkinCount} check-ins
                      {row.weeksActive != null ? ` · ${row.weeksActive} wks` : ''}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: colors.textMuted }}>
                      Body {row.breakdown.body}/40 · Consistency {row.breakdown.consistency}/30 · Photos {row.breakdown.photos}/20 · Time {row.breakdown.time}/10
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      {row.marketingPhotoConsent ? (
                        <span style={{ color: colors.success }}>Marketing photo consent ✓</span>
                      ) : (
                        <span style={{ color: colors.warning }}>No marketing consent yet</span>
                      )}
                      {row.showcaseStatus ? (
                        <span style={{ marginLeft: 10, color: colors.textMuted }}>Showcase: {row.showcaseStatus}</span>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 100 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: gradeColor[row.grade] ?? colors.textPrimary }}>
                      {row.score}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Grade {row.grade}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      <Link
                        href={`/coach/client/${row.clientId}`}
                        style={{ fontSize: 13, fontWeight: 600, color: colors.accent }}
                      >
                        Open client
                      </Link>
                      {canNominate && (
                        <button
                          type="button"
                          disabled={busyId === row.clientId}
                          onClick={() => void nominate(row)}
                          style={{
                            marginTop: 6,
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: colors.accent,
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {busyId === row.clientId ? 'Saving…' : 'Nominate for website'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CoachShell>
  )
}
