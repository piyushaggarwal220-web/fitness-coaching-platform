'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminShell } from '@/components/admin/AdminShell'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import type { TransformationScoreRow } from '@/lib/transformation-scores'

export default function AdminTransformationScoresPage() {
  const [scores, setScores] = useState<TransformationScoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/admin/transformation-scores')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to load scores.')
        setLoading(false)
        return
      }
      setScores((data.scores as TransformationScoreRow[]) ?? [])
      setLoading(false)
    }
    void load()
  }, [])

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle('Transformations')}</h1>
        <p style={s.subtitle}>
          Ranked by body change toward goal, check-in consistency, progress photos, and time on plan. Open a profile to review.
        </p>
        {error && <div style={s.error}>{error}</div>}
        {loading ? (
          <div style={s.loading}>Loading scores…</div>
        ) : scores.length === 0 ? (
          <div style={s.empty}>No scored clients yet. Scores appear after onboarding plus weekly check-ins or photos.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {scores.map((row) => (
              <div key={row.clientId} style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 18 }}>{row.name || 'Unnamed'}</strong>
                    <span style={{ marginLeft: 8, color: '#888', fontSize: 13 }}>{row.email}</span>
                    <div style={{ marginTop: 8, fontSize: 13, color: '#aaa' }}>
                      Weight {row.weightStart ?? '—'} → {row.weightLatest ?? '—'}
                      {row.weightChangeKg != null ? ` (${row.weightChangeKg > 0 ? '+' : ''}${row.weightChangeKg} kg)` : ''}
                      {' · '}
                      {row.checkinCount} weekly check-ins
                      {row.weeksActive != null ? ` · ${row.weeksActive} weeks` : ''}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
                      Body {row.breakdown.body}/40 · Consistency {row.breakdown.consistency}/30 · Photos {row.breakdown.photos}/20 · Time {row.breakdown.time}/10
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 32, fontWeight: 800 }}>{row.score}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Grade {row.grade}</div>
                    <Link href={`/admin/clients/${row.clientId}`} style={{ ...s.linkBtn, display: 'inline-block', marginTop: 10 }}>
                      Open profile
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
