'use client'

import { useEffect, useState } from 'react'
import { Play, Search, X } from 'lucide-react'
import { readApiJson } from '@/lib/api-response'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { trackerInputStyle } from '@/components/tracker/TrackerPrimitives'

type DemoExercise = {
  id: string
  title: string
  description?: string | null
  instructions?: string[] | null
  importantPoints?: string[] | null
  videoUrl?: string | null
  thumbnailUrl?: string | null
  muscleGroup?: string | null
  equipment?: string | null
}

type Candidate = {
  id: string
  title: string
  slug?: string
  muscleGroup?: string | null
  equipment?: string | null
  thumbnailUrl?: string | null
}

type Props = {
  /** Plan exercise name used to look up a matching demo video. */
  exerciseName: string
  compact?: boolean
}

export function ExerciseDemoButton({ exerciseName, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [demo, setDemo] = useState<DemoExercise | null>(null)
  const [source, setSource] = useState<'override' | 'auto' | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [pickSearch, setPickSearch] = useState('')
  const [candidateLoading, setCandidateLoading] = useState(false)

  const loadDemo = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/exercises/demo?name=${encodeURIComponent(exerciseName)}`, {
        credentials: 'include',
      })
      const parsed = await readApiJson<{
        exercise?: DemoExercise
        source?: 'override' | 'auto'
        error?: string
      }>(res)
      if (!parsed.ok) throw new Error(parsed.error)
      if (!parsed.data.exercise?.videoUrl) {
        throw new Error('No demo video found for this exercise')
      }
      setDemo(parsed.data.exercise)
      setSource(parsed.data.source ?? 'auto')
    } catch (err) {
      setDemo(null)
      setSource(null)
      setError(err instanceof Error ? err.message : 'Could not load demo')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setPicking(false)
    setPickSearch(exerciseName)
    void loadDemo()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when sheet opens / name changes
  }, [open, exerciseName])

  useEffect(() => {
    if (!open || !picking) return

    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        setCandidateLoading(true)
        try {
          const q = pickSearch.trim() || exerciseName
          const res = await fetch(
            `/api/exercises/demo?mode=candidates&name=${encodeURIComponent(q)}`,
            { credentials: 'include' }
          )
          const parsed = await readApiJson<{ candidates?: Candidate[]; error?: string }>(res)
          if (!parsed.ok) throw new Error(parsed.error)
          if (!cancelled) setCandidates(parsed.data.candidates ?? [])
        } catch (err) {
          if (!cancelled) {
            setCandidates([])
            setError(err instanceof Error ? err.message : 'Search failed')
          }
        } finally {
          if (!cancelled) setCandidateLoading(false)
        }
      })()
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, picking, pickSearch, exerciseName])

  const selectCandidate = async (candidate: Candidate) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/exercises/demo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: exerciseName,
          ymoveExerciseId: candidate.id,
        }),
      })
      const parsed = await readApiJson<{ exercise?: DemoExercise; error?: string }>(res)
      if (!parsed.ok) throw new Error(parsed.error)
      if (!parsed.data.exercise?.videoUrl) throw new Error('Selected exercise has no video')
      setDemo(parsed.data.exercise)
      setSource('override')
      setPicking(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save correction')
    } finally {
      setSaving(false)
    }
  }

  const close = () => {
    setOpen(false)
    setPicking(false)
    setError('')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={compact ? styles.compactBtn : styles.btn}
        aria-label={`How to do ${exerciseName}`}
      >
        <Play size={compact ? 14 : 16} fill={colors.accent} color={colors.accent} />
        {!compact && <span>How to</span>}
      </button>

      {open && (
        <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={`Demo: ${exerciseName}`}>
          <div style={styles.sheet}>
            <div style={styles.sheetHeader}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={styles.sheetTitle}>
                  {picking ? 'Pick the correct video' : (demo?.title ?? exerciseName)}
                </div>
                {!picking && (demo?.muscleGroup || demo?.equipment) && (
                  <div style={styles.meta}>
                    {[demo.muscleGroup, demo.equipment].filter(Boolean).join(' · ')}
                    {source === 'override' ? ' · Saved match' : ''}
                  </div>
                )}
                {picking && (
                  <div style={styles.meta}>For plan exercise: {exerciseName}</div>
                )}
              </div>
              <button type="button" onClick={close} style={styles.close} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            {loading && <p style={styles.status}>Loading demo…</p>}
            {error && !loading && <p style={styles.error}>{error}</p>}

            {!picking && !loading && demo?.videoUrl && (
              <video
                key={demo.videoUrl}
                src={demo.videoUrl}
                poster={demo.thumbnailUrl ?? undefined}
                controls
                playsInline
                style={styles.video}
              />
            )}

            {!picking && !loading && demo?.instructions && demo.instructions.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Steps</div>
                <ol style={styles.list}>
                  {demo.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {!picking && !loading && demo?.importantPoints && demo.importantPoints.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Form tips</div>
                <ul style={styles.list}>
                  {demo.importantPoints.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}

            {!picking && !loading && (
              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => {
                    setPicking(true)
                    setPickSearch(exerciseName)
                    setError('')
                  }}
                  style={styles.secondaryBtn}
                >
                  Wrong video? Fix match
                </button>
              </div>
            )}

            {picking && (
              <div>
                <div style={{ position: 'relative', marginBottom: spacing[3] }}>
                  <Search
                    size={16}
                    color={colors.textMuted}
                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    value={pickSearch}
                    onChange={(e) => setPickSearch(e.target.value)}
                    placeholder="Search correct exercise…"
                    style={{ ...trackerInputStyle, paddingLeft: 38, minHeight: 44 }}
                    autoFocus
                  />
                </div>

                {candidateLoading && <p style={styles.status}>Searching…</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={saving}
                      onClick={() => void selectCandidate(c)}
                      style={styles.candidate}
                    >
                      <div style={styles.thumbWrap}>
                        {c.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.thumbnailUrl} alt="" style={styles.thumb} />
                        ) : (
                          <Play size={16} color={colors.accent} />
                        )}
                      </div>
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' }}>
                          {[c.muscleGroup, c.equipment].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {!candidateLoading && candidates.length === 0 && (
                  <p style={styles.status}>No matches. Try a simpler name like “bench press”.</p>
                )}

                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  style={{ ...styles.secondaryBtn, marginTop: spacing[3], width: '100%' }}
                  disabled={saving}
                >
                  Back to video
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    minHeight: 36,
    borderRadius: 10,
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgElevated,
    color: colors.accent,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },
  compactBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgElevated,
    cursor: 'pointer',
    flexShrink: 0,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: spacing[3],
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88vh',
    overflowY: 'auto',
    background: colors.bgCard,
    borderRadius: radius.lg,
    border: `1px solid ${colors.borderSubtle}`,
    padding: spacing[4],
  },
  sheetHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: spacing[3],
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: colors.textPrimary,
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgElevated,
    color: colors.textSecondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  video: {
    width: '100%',
    maxHeight: 360,
    borderRadius: 12,
    background: '#000',
    marginBottom: spacing[3],
  },
  status: {
    margin: 0,
    color: colors.textMuted,
    fontSize: 14,
  },
  error: {
    margin: 0,
    color: colors.danger,
    fontSize: 14,
  },
  section: {
    marginTop: spacing[3],
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  list: {
    margin: 0,
    paddingLeft: 18,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 1.5,
  },
  actions: {
    marginTop: spacing[4],
    display: 'flex',
    gap: 8,
  },
  secondaryBtn: {
    padding: '10px 14px',
    minHeight: 44,
    borderRadius: 12,
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgElevated,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  candidate: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgElevated,
    cursor: 'pointer',
    color: colors.textPrimary,
  },
  thumbWrap: {
    width: 56,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    background: colors.bgCard,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  thumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
}
