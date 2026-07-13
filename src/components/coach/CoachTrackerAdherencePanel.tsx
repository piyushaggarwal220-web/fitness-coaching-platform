'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { colors, spacing } from '@/lib/design-tokens'
import { coachPageStyles } from '@/lib/coach-page-styles'

type AdherenceRow = {
  clientId: string
  clientName: string | null
  overallAverage: number
  categories: {
    diet: number
    workout: number
    water: number
    supplements: number
    cardio: number
    sleep: number
  }
  missedMeals: number
  missedWorkouts: number
}

export function CoachTrackerAdherencePanel() {
  const [rows, setRows] = useState<AdherenceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/coach/tracker-adherence')
        if (res.ok) {
          const data = (await res.json()) as { summaries?: AdherenceRow[] }
          setRows(data.summaries ?? [])
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) {
    return (
      <div style={coachPageStyles.card}>
        <p style={{ margin: 0, color: colors.textMuted }}>Loading daily adherence…</p>
      </div>
    )
  }

  if (rows.length === 0) return null

  const low = rows.filter((r) => r.overallAverage < 70).slice(0, 5)

  return (
    <div style={coachPageStyles.card}>
      <h2 style={{ ...coachPageStyles.sectionTitle, marginTop: 0 }}>Daily tracker · last 7 days</h2>
      <p style={{ margin: `0 0 ${spacing[4]}px`, fontSize: 14, color: colors.textSecondary }}>
        Clients sorted by lowest adherence first.
      </p>
      <div style={{ display: 'grid', gap: spacing[3] }}>
        {(low.length > 0 ? low : rows.slice(0, 5)).map((row) => (
          <Link
            key={row.clientId}
            href={`/coach/client/${row.clientId}`}
            style={{
              textDecoration: 'none',
              display: 'block',
              padding: spacing[3],
              borderRadius: 12,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgElevated,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: colors.textPrimary }}>
                  {row.clientName ?? 'Client'}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                  Diet {row.categories.diet}% · Workout {row.categories.workout}% · Water {row.categories.water}%
                </p>
              </div>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: row.overallAverage < 60 ? colors.danger : colors.accent,
                }}
              >
                {row.overallAverage}%
              </span>
            </div>
            {(row.missedMeals > 0 || row.missedWorkouts > 0) && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.textMuted }}>
                {row.missedMeals > 0 ? `${row.missedMeals} missed meals` : ''}
                {row.missedMeals > 0 && row.missedWorkouts > 0 ? ' · ' : ''}
                {row.missedWorkouts > 0 ? `${row.missedWorkouts} missed workouts` : ''}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
