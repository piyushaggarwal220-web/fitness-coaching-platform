'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminShell } from '@/components/admin/AdminShell'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { scoreRowForShowcase, type TransformationScoreRow } from '@/lib/transformation-scores'
import type { TransformationShowcaseRow } from '@/lib/transformation-showcases'

export default function AdminTransformationScoresPage() {
  const [scores, setScores] = useState<TransformationScoreRow[]>([])
  const [showcases, setShowcases] = useState<TransformationShowcaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    const [scoresRes, showcasesRes] = await Promise.all([
      fetch('/api/admin/transformation-scores'),
      fetch('/api/admin/transformation-showcases'),
    ])
    const scoresData = await scoresRes.json()
    const showcasesData = await showcasesRes.json()
    if (!scoresRes.ok) {
      setError(scoresData.error ?? 'Failed to load scores.')
      setLoading(false)
      return
    }
    setScores((scoresData.scores as TransformationScoreRow[]) ?? [])
    setShowcases((showcasesData.showcases as TransformationShowcaseRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const updateShowcase = async (showcaseId: string, status: 'approved' | 'published' | 'rejected') => {
    setBusyId(showcaseId)
    const res = await fetch('/api/admin/transformation-showcases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showcaseId, status }),
    })
    setBusyId(null)
    if (res.ok) void load()
  }

  const candidates = showcases.filter((x) => x.status === 'candidate' || x.status === 'approved')

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle('Transformations')}</h1>
        <p style={s.subtitle}>
          Scores rank every client. Coaches nominate showcase-worthy results — approve here before using photos on the website.
        </p>
        {error && <div style={s.error}>{error}</div>}

        {!loading && candidates.length > 0 && (
          <>
            <h2 style={{ ...s.title, fontSize: 20, marginTop: 24 }}>Showcase queue</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {candidates.map((row) => (
                <div key={row.id} style={s.card}>
                  <strong>{row.clientName ?? 'Client'}</strong>
                  <span style={{ marginLeft: 8, color: '#888' }}>Grade {row.gradeSnapshot} · {row.scoreSnapshot}/100</span>
                  <div style={{ marginTop: 8, fontSize: 13, color: '#aaa' }}>
                    {row.weightStartKg ?? '—'} → {row.weightLatestKg ?? '—'} kg
                    {row.weeksActive != null ? ` · ${row.weeksActive} weeks` : ''}
                    {row.marketingPhotoConsent ? ' · consent ✓' : ' · ⚠ no consent'}
                  </div>
                  {row.quote && <p style={{ margin: '8px 0 0', fontStyle: 'italic', color: '#ccc' }}>&ldquo;{row.quote}&rdquo;</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {row.beforePhotoUrl && (
                      <img src={row.beforePhotoUrl} alt="Before" style={{ width: 72, height: 96, objectFit: 'cover', borderRadius: 8 }} />
                    )}
                    {row.afterPhotoUrl && (
                      <img src={row.afterPhotoUrl} alt="After" style={{ width: 72, height: 96, objectFit: 'cover', borderRadius: 8 }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="button" disabled={busyId === row.id} style={s.linkBtn} onClick={() => void updateShowcase(row.id, 'approved')}>
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || !row.marketingPhotoConsent}
                      style={s.linkBtn}
                      onClick={() => void updateShowcase(row.id, 'published')}
                    >
                      Publish
                    </button>
                    <button type="button" disabled={busyId === row.id} style={s.linkBtn} onClick={() => void updateShowcase(row.id, 'rejected')}>
                      Reject
                    </button>
                    <Link href={`/admin/clients/${row.clientId}`} style={s.linkBtn}>
                      Profile
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 style={{ ...s.title, fontSize: 20 }}>All client scores</h2>
        {loading ? (
          <div style={s.loading}>Loading scores…</div>
        ) : scores.length === 0 ? (
          <div style={s.empty}>No scored clients yet.</div>
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
                      {scoreRowForShowcase(row) ? ' · showcase-ready' : ''}
                      {row.showcaseStatus ? ` · ${row.showcaseStatus}` : ''}
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
