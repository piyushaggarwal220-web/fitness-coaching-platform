'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { Flag, Scale } from 'lucide-react'
import { PhotoGalleryViewer, type GalleryPhoto } from '@/components/journey/PhotoGalleryViewer'
import { PhotoCompareStrip } from '@/components/journey/PhotoCompareStrip'
import { StorageImage } from '@/components/ui/StorageImage'
import {
  loadProgressJourney,
  type JourneyWeeklyEntry,
  type ProgressJourneyData,
} from '@/lib/progress-journey'
import { coachColors as colors } from '@/lib/design-tokens'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

function collectPhotos(entry: JourneyWeeklyEntry): GalleryPhoto[] {
  const photos: GalleryPhoto[] = []
  if (entry.photos.front) photos.push({ url: entry.photos.front, label: 'Front' })
  if (entry.photos.side) photos.push({ url: entry.photos.side, label: 'Side' })
  if (entry.photos.back) photos.push({ url: entry.photos.back, label: 'Back' })
  entry.photos.extra?.forEach((url, i) => photos.push({ url, label: `Extra ${i + 1}` }))
  return photos
}

/** Coach-facing journey + progress photos for a client. */
export function CoachClientJourneyPanel({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ProgressJourneyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gallery, setGallery] = useState<{
    photos: GalleryPhoto[]
    index: number
    meta: { weekNumber?: number | null; date?: string | null; weight?: number | null }
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadProgressJourney(supabase, clientId)
      .then((journey) => {
        if (!cancelled) setData(journey)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load journey')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  if (loading) {
    return (
      <div style={styles.section}>
        <h2 style={styles.title}>Client journey</h2>
        <p style={styles.muted}>Loading journey and photos…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={styles.section}>
        <h2 style={styles.title}>Client journey</h2>
        <p style={styles.muted}>{error || 'No journey data yet.'}</p>
      </div>
    )
  }

  const { stats, weeklyEntries, progressPhotos, milestones } = data
  const latest = weeklyEntries[weeklyEntries.length - 1] ?? null
  const prior = weeklyEntries.length > 1 ? weeklyEntries[weeklyEntries.length - 2] : null

  return (
    <div style={styles.section}>
      {gallery && (
        <PhotoGalleryViewer
          photos={gallery.photos}
          initialIndex={gallery.index}
          meta={gallery.meta}
          onClose={() => setGallery(null)}
        />
      )}

      <h2 style={styles.title}>Client journey</h2>
      <p style={styles.muted}>
        {stats.weeksActive} weeks · {stats.totalCheckins} check-ins · {stats.totalWorkouts} workouts
        {stats.weightChange != null
          ? ` · weight ${stats.weightChange > 0 ? '+' : ''}${stats.weightChange.toFixed(1)} kg`
          : ''}
      </p>

      {latest && prior && (
        <div style={{ marginTop: 16 }}>
          <h3 style={styles.subtitle}>
            <Scale size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            Progress compare
          </h3>
          <PhotoCompareStrip
            previous={{
              label: prior.coachingWeek != null ? `Week ${prior.coachingWeek}` : 'Earlier',
              front: prior.photos.front,
              side: prior.photos.side,
              back: prior.photos.back,
            }}
            current={{
              label: latest.coachingWeek != null ? `Week ${latest.coachingWeek}` : 'Latest',
              front: latest.photos.front,
              side: latest.photos.side,
              back: latest.photos.back,
            }}
          />
        </div>
      )}

      {progressPhotos.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={styles.subtitle}>Progress photos</h3>
          <div style={styles.photoGrid}>
            {progressPhotos
              .slice()
              .reverse()
              .slice(0, 12)
              .map((entry, idx) => {
                const photos: GalleryPhoto[] = []
                if (entry.front) photos.push({ url: entry.front, label: 'Front' })
                if (entry.side) photos.push({ url: entry.side, label: 'Side' })
                if (entry.back) photos.push({ url: entry.back, label: 'Back' })
                if (photos.length === 0) return null
                return (
                  <button
                    key={`${entry.date}-${idx}`}
                    type="button"
                    style={styles.photoCard}
                    onClick={() =>
                      setGallery({
                        photos,
                        index: 0,
                        meta: { date: entry.date },
                      })
                    }
                  >
                    <StorageImage
                      src={photos[0].url}
                      progress
                      alt={photos[0].label ?? 'Progress photo'}
                      style={styles.thumb}
                    />
                    <span style={styles.photoDate}>{entry.date}</span>
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {weeklyEntries.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={styles.subtitle}>Weekly check-ins</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...weeklyEntries].reverse().slice(0, 8).map((entry) => {
              const photos = collectPhotos(entry)
              return (
                <div key={entry.id} style={styles.weekCard}>
                  <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                    {entry.coachingWeek != null ? `Week ${entry.coachingWeek}` : 'Check-in'} · {entry.date}
                    {entry.weight != null ? ` · ${entry.weight} kg` : ''}
                  </div>
                  {entry.checkinSummary && (
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.textSecondary }}>
                      {entry.checkinSummary}
                    </p>
                  )}
                  {entry.coachComment && (
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.textMuted }}>
                      Coach: {entry.coachComment}
                    </p>
                  )}
                  {photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {photos.map((photo, i) => (
                        <button
                          key={`${photo.url}-${i}`}
                          type="button"
                          style={{ border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                          onClick={() =>
                            setGallery({
                              photos,
                              index: i,
                              meta: {
                                weekNumber: entry.coachingWeek,
                                date: entry.date,
                                weight: entry.weight,
                              },
                            })
                          }
                        >
                          <StorageImage
                            src={photo.url}
                            progress
                            alt={photo.label ?? 'Progress photo'}
                            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {milestones.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={styles.subtitle}>
            <Flag size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            Milestones
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: colors.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
            {[...milestones].reverse().slice(0, 10).map((m) => (
              <li key={m.id}>
                <strong style={{ color: colors.textPrimary }}>{m.title}</strong> — {m.date}
                {m.description ? `: ${m.description}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {weeklyEntries.length === 0 && progressPhotos.length === 0 && (
        <p style={{ ...styles.muted, marginTop: 12 }}>No journey entries or photos yet.</p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: colors.textPrimary },
  subtitle: { margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: colors.textPrimary },
  muted: { margin: '8px 0 0', fontSize: 13, color: colors.textMuted },
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: 10,
  },
  photoCard: {
    border: 'none',
    padding: 0,
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  thumb: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, display: 'block' },
  photoDate: { display: 'block', marginTop: 4, fontSize: 11, color: colors.textMuted },
  weekCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.bgPrimary,
    border: `1px solid ${colors.borderSubtle}`,
  },
}
