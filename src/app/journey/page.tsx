'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flag, MessageCircle, Scale, Trophy } from 'lucide-react'
import { ClientShell } from '@/components/ui/ClientShell'
import { Card, StatCard } from '@/components/ui/Card'
import { authenticateClient } from '@/lib/onboarding'
import { loadProgressJourney, type ProgressJourneyData } from '@/lib/progress-journey'
import { colors, spacing } from '@/lib/design-tokens'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export default function JourneyPage() {
  const router = useRouter()
  const [data, setData] = useState<ProgressJourneyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const auth = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
      if (!auth?.profile) { setLoading(false); return }
      const journey = await loadProgressJourney(supabase, auth.profile.id)
      setData(journey)
      setLoading(false)
    }
    void load()
  }, [router])

  if (loading) return <ClientShell title="Journey" loading />
  if (!data) return null

  const { stats, milestones, weeklyEntries, weightHistory, progressPhotos, coachComments, recentWorkouts } = data

  return (
    <ClientShell title="Journey">
      <div style={{ marginBottom: spacing[5] }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.75rem, 6vw, 2.25rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>
          Your Journey
        </h1>
        <p style={{ margin: '8px 0 0', color: colors.textSecondary, fontSize: 15 }}>
          Every step forward counts
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing[2], marginBottom: spacing[5] }}>
        <StatCard label="Weeks Active" value={String(stats.weeksActive)} />
        <StatCard label="Check-ins" value={String(stats.totalCheckins)} />
        <StatCard label="Workouts" value={String(stats.totalWorkouts)} />
        <StatCard label="Minutes" value={String(stats.totalWorkoutMinutes)} />
        {stats.weightChange != null && (
          <StatCard
            label="Weight Change"
            value={`${stats.weightChange > 0 ? '+' : ''}${stats.weightChange.toFixed(1)} kg`}
            highlight={stats.weightChange < 0}
          />
        )}
      </div>

      {/* Timeline */}
      <section style={{ marginBottom: spacing[5] }}>
        <h2 style={sectionHeading}><Trophy size={14} style={{ display: 'inline', marginRight: 6 }} />Milestones</h2>
        <Card variant="elevated">
          {milestones.length === 0 ? (
            <p style={{ margin: 0, color: colors.textMuted, fontSize: 15 }}>Your timeline will appear as you progress.</p>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              <div style={{ position: 'absolute', left: 10, top: 4, bottom: 4, width: 2, backgroundColor: colors.accent, opacity: 0.3, borderRadius: 1 }} />
              {milestones.map((m, i) => (
                <div key={m.id} style={{ position: 'relative', marginBottom: i < milestones.length - 1 ? spacing[4] : 0 }}>
                  <div style={{
                    position: 'absolute', left: -24, top: 2, width: 20, height: 20,
                    borderRadius: '50%', backgroundColor: colors.accentMuted,
                    border: `2px solid ${colors.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10,
                  }}>
                    <Flag size={10} color={colors.accent} />
                  </div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{m.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>{m.description}</p>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.textMuted }}>{new Date(m.date).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Weekly entries */}
      {weeklyEntries.length > 0 && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>Weekly Check-ins</h2>
          {weeklyEntries.map((entry) => (
            <Card key={entry.id} variant="glass" style={{ marginBottom: spacing[3] }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[2] }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{new Date(entry.date).toLocaleDateString()}</span>
                {entry.weight != null && (
                  <span style={{ fontWeight: 700, fontSize: 16, color: colors.accent }}>{entry.weight} kg</span>
                )}
              </div>
              {entry.planVersion != null && (
                <p style={{ margin: '0 0 8px', fontSize: 12, color: colors.textMuted }}>Plan v{entry.planVersion}</p>
              )}
              {entry.checkinSummary && (
                <p style={{ fontSize: 14, color: colors.textSecondary, margin: '0 0 12px', lineHeight: 1.5 }}>{entry.checkinSummary}</p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: entry.coachComment ? 12 : 0 }}>
                {entry.photos.front && <img src={entry.photos.front} alt="Front" style={photoStyle} />}
                {entry.photos.side && <img src={entry.photos.side} alt="Side" style={photoStyle} />}
                {entry.photos.back && <img src={entry.photos.back} alt="Back" style={photoStyle} />}
                {entry.photos.extra?.map((url, i) => (
                  <img key={i} src={url} alt={`Extra ${i + 1}`} style={photoStyle} />
                ))}
              </div>
              {entry.coachComment && (
                <div style={{ backgroundColor: colors.accentMuted, padding: 12, borderRadius: 12, fontSize: 14, lineHeight: 1.5, color: colors.textSecondary }}>
                  <MessageCircle size={14} color={colors.accent} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  {entry.coachComment}
                </div>
              )}
            </Card>
          ))}
        </section>
      )}

      {weightHistory.length > 1 && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}><Scale size={14} style={{ display: 'inline', marginRight: 6 }} />Weight History</h2>
          <Card variant="elevated">
            {weightHistory.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 15,
                padding: '10px 0',
                borderBottom: i < weightHistory.length - 1 ? `1px solid ${colors.divider}` : 'none',
              }}>
                <span style={{ color: colors.textSecondary }}>{new Date(entry.date).toLocaleDateString()}</span>
                <span style={{ fontWeight: 600 }}>{entry.weight} kg</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {progressPhotos.length > 0 && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>Progress Photos</h2>
          {progressPhotos.map((photo, i) => (
            <Card key={i} variant="elevated" style={{ marginBottom: spacing[3] }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.textMuted }}>
                {photo.date ? new Date(photo.date).toLocaleDateString() : 'Start'}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photo.front && <img src={photo.front} alt="Front" style={photoStyle} />}
                {photo.side && <img src={photo.side} alt="Side" style={photoStyle} />}
                {photo.back && <img src={photo.back} alt="Back" style={photoStyle} />}
              </div>
            </Card>
          ))}
        </section>
      )}

      {coachComments.length > 0 && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>Coach Comments</h2>
          <Card variant="glass" padding={0} style={{ overflow: 'hidden' }}>
            {coachComments.map((c, i) => (
              <div key={i} style={{
                padding: `${spacing[3]}px ${spacing[4]}px`,
                borderBottom: i < coachComments.length - 1 ? `1px solid ${colors.divider}` : 'none',
              }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, color: colors.textMuted }}>{new Date(c.date).toLocaleDateString()}</p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: colors.textSecondary }}>{c.comment}</p>
              </div>
            ))}
          </Card>
        </section>
      )}

      {recentWorkouts.length > 0 && (
        <section>
          <h2 style={sectionHeading}>Recent Workouts</h2>
          <Card variant="elevated" padding={0} style={{ overflow: 'hidden' }}>
            {recentWorkouts.map((w, i) => (
              <div key={w.id} style={{
                padding: `${spacing[3]}px ${spacing[4]}px`,
                borderBottom: i < recentWorkouts.length - 1 ? `1px solid ${colors.divider}` : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{w.name}</span>
                  <span style={{ color: colors.textMuted, fontSize: 14 }}>{w.duration} min</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: colors.textMuted }}>{new Date(w.date).toLocaleDateString()}</p>
              </div>
            ))}
          </Card>
        </section>
      )}
    </ClientShell>
  )
}

const sectionHeading: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 13,
  fontWeight: 600,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  display: 'flex',
  alignItems: 'center',
}

const photoStyle: React.CSSProperties = {
  width: 90,
  height: 120,
  objectFit: 'cover',
  borderRadius: 12,
  border: `1px solid ${colors.borderSubtle}`,
}
