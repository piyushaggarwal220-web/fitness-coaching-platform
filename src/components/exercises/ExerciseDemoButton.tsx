'use client'

import { useEffect, useState } from 'react'
import { Play, X } from 'lucide-react'
import { readApiJson } from '@/lib/api-response'
import { colors, radius, spacing } from '@/lib/design-tokens'

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

type Props = {
  /** Plan exercise name used to look up a matching demo video. */
  exerciseName: string
  compact?: boolean
}

export function ExerciseDemoButton({ exerciseName, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [demo, setDemo] = useState<DemoExercise | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/exercises/${encodeURIComponent(exerciseName)}?byName=1`, {
          credentials: 'include',
        })
        const parsed = await readApiJson<{ exercise?: DemoExercise; error?: string }>(res)
        if (!parsed.ok) throw new Error(parsed.error)
        if (!parsed.data.exercise?.videoUrl) {
          throw new Error('No demo video found for this exercise')
        }
        if (!cancelled) setDemo(parsed.data.exercise)
      } catch (err) {
        if (!cancelled) {
          setDemo(null)
          setError(err instanceof Error ? err.message : 'Could not load demo')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, exerciseName])

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
                <div style={styles.sheetTitle}>{demo?.title ?? exerciseName}</div>
                {(demo?.muscleGroup || demo?.equipment) && (
                  <div style={styles.meta}>
                    {[demo.muscleGroup, demo.equipment].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setOpen(false)} style={styles.close} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            {loading && <p style={styles.status}>Loading demo…</p>}
            {error && !loading && <p style={styles.error}>{error}</p>}

            {!loading && !error && demo?.videoUrl && (
              <video
                key={demo.videoUrl}
                src={demo.videoUrl}
                poster={demo.thumbnailUrl ?? undefined}
                controls
                playsInline
                style={styles.video}
              />
            )}

            {!loading && demo?.instructions && demo.instructions.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Steps</div>
                <ol style={styles.list}>
                  {demo.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {!loading && demo?.importantPoints && demo.importantPoints.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Form tips</div>
                <ul style={styles.list}>
                  {demo.importantPoints.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
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
}
