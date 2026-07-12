'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/app/components/Navbar'
import { authenticateClient } from '@/lib/onboarding'
import { loadProgressJourney, type ProgressJourneyData } from '@/lib/progress-journey'
import { mobileStyles } from '@/lib/mobile-styles'
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

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={mobileStyles.loading}>Loading your journey...</div>
      </>
    )
  }

  if (!data) return null

  const { stats, milestones, weightHistory, progressPhotos, coachComments, recentWorkouts } = data

  return (
    <>
      <Navbar />
      <div style={{ ...mobileStyles.page, backgroundColor: '#f8f9fa' }}>
        <div style={mobileStyles.container}>
          <h1 style={mobileStyles.title}>Your Progress Journey</h1>
          <p style={mobileStyles.subtitle}>See how far you&apos;ve come on your coaching journey.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Weeks Active" value={String(stats.weeksActive)} />
            <StatCard label="Check-ins" value={String(stats.totalCheckins)} />
            <StatCard label="Workouts" value={String(stats.totalWorkouts)} />
            <StatCard label="Workout Minutes" value={String(stats.totalWorkoutMinutes)} />
            <StatCard label="Calories Burned" value={String(stats.totalWorkoutCalories)} />
            {stats.weightChange != null && (
              <StatCard
                label="Weight Change"
                value={`${stats.weightChange > 0 ? '+' : ''}${stats.weightChange.toFixed(1)} kg`}
                highlight={stats.weightChange < 0}
              />
            )}
          </div>

          {recentWorkouts.length > 0 && (
            <div style={mobileStyles.card}>
              <h2 style={sectionTitle}>Recent Workouts</h2>
              {recentWorkouts.map((w) => (
                <div key={w.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee', fontSize: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 500 }}>{w.name}</span>
                    <span style={{ color: '#888' }}>{w.duration} min</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{new Date(w.date).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}

          {weightHistory.length > 1 && (
            <div style={mobileStyles.card}>
              <h2 style={sectionTitle}>Weight History</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {weightHistory.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#666' }}>{new Date(entry.date).toLocaleDateString()}</span>
                    <span style={{ fontWeight: 600 }}>{entry.weight} kg</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {progressPhotos.length > 0 && (
            <div style={mobileStyles.card}>
              <h2 style={sectionTitle}>Progress Photos</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {progressPhotos.map((photo, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
                      {photo.date ? new Date(photo.date).toLocaleDateString() : 'Start'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {photo.front && <img src={photo.front} alt="Front" style={photoStyle} />}
                      {photo.side && <img src={photo.side} alt="Side" style={photoStyle} />}
                      {photo.back && <img src={photo.back} alt="Back" style={photoStyle} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {coachComments.length > 0 && (
            <div style={mobileStyles.card}>
              <h2 style={sectionTitle}>Coach Comments</h2>
              {coachComments.map((c, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: i < coachComments.length - 1 ? '1px solid #eee' : 'none' }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{new Date(c.date).toLocaleDateString()}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{c.comment}</div>
                </div>
              ))}
            </div>
          )}

          <div style={mobileStyles.card}>
            <h2 style={sectionTitle}>Timeline</h2>
            {milestones.length === 0 ? (
              <p style={{ color: '#888', fontSize: 14 }}>Your journey timeline will appear as you progress.</p>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 2, backgroundColor: '#e94560', opacity: 0.3 }} />
                {milestones.map((m) => (
                  <div key={m.id} style={{ position: 'relative', marginBottom: 20 }}>
                    <div style={{ position: 'absolute', left: -20, top: 2, fontSize: 18 }}>{m.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{m.title}</div>
                    <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{m.description}</div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{new Date(m.date).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ ...mobileStyles.card, textAlign: 'center', marginBottom: 0, padding: '16px 12px' }}>
      <div style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 700, color: highlight ? '#28a745' : '#e94560' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#1a1a2e' }
const photoStyle: React.CSSProperties = { width: 100, height: 140, objectFit: 'cover', borderRadius: 8 }
