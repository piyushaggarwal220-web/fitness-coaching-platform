'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { colors, radius, spacing } from '@/lib/design-tokens'

type FormPayload = {
  configured: boolean
  skipped: boolean
  found: boolean
  name: string | null
  steps: string[]
  muscles: string[]
  exerciseId: number | null
  hasVideo: boolean
  error?: string
}

type Props = {
  exerciseName: string
  onClose: () => void
}

export function ExerciseFormSheet({ exerciseName, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<FormPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ name: exerciseName })
    void fetch(`/api/exercises/form?${params}`, { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as FormPayload & { error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Could not load form')
        if (!cancelled) setData(json)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setData({
            configured: true,
            skipped: false,
            found: false,
            name: null,
            steps: [],
            muscles: [],
            exerciseId: null,
            hasVideo: false,
            error: err instanceof Error ? err.message : 'Could not load form',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [exerciseName])

  const title = data?.name || exerciseName
  const mediaSrc = `/api/exercises/form/media?${new URLSearchParams({ name: exerciseName })}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-form-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: spacing[3],
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '88vh',
          overflow: 'auto',
          background: colors.bgElevated,
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: radius.lg,
          padding: spacing[4],
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: colors.accent }}>
              FORM
            </p>
            <h2 id="exercise-form-title" style={{ margin: '4px 0 0', fontSize: 20, color: colors.textPrimary }}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            style={{
              border: 'none',
              background: 'transparent',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={22} />
          </button>
        </div>

        {loading ? (
          <p style={{ marginTop: 16, color: colors.textMuted }}>Loading form…</p>
        ) : data?.error ? (
          <p style={{ marginTop: 16, color: colors.danger }}>{data.error}</p>
        ) : !data?.configured ? (
          <p style={{ marginTop: 16, color: colors.textSecondary, lineHeight: 1.45 }}>
            Form videos are not connected yet. Follow your coach&apos;s notes, or ask in chat.
          </p>
        ) : data.skipped || !data.found ? (
          <p style={{ marginTop: 16, color: colors.textSecondary, lineHeight: 1.45 }}>
            No form video for this move. Follow your coach&apos;s notes, or ask in chat.
          </p>
        ) : (
          <>
            {data.hasVideo ? (
              <video
                controls
                playsInline
                preload="metadata"
                style={{
                  width: '100%',
                  marginTop: 14,
                  borderRadius: 12,
                  background: '#000',
                  maxHeight: 280,
                }}
                src={mediaSrc}
              />
            ) : null}
            {data.muscles.length > 0 ? (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: colors.textMuted }}>
                {data.muscles.join(' · ')}
              </p>
            ) : null}
            {data.steps.length > 0 ? (
              <ol style={{ margin: '12px 0 0', paddingLeft: 18, color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
                {data.steps.map((step, index) => (
                  <li key={`${index}-${step.slice(0, 24)}`} style={{ marginBottom: 8 }}>
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ marginTop: 12, color: colors.textSecondary }}>
                Video only — no written cues for this one.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
