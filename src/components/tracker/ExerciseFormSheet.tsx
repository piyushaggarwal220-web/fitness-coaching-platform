'use client'

import { useEffect, useId, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { colors, layout, radius, spacing } from '@/lib/design-tokens'

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
  const titleId = useId()
  const [loading, setLoading] = useState(true)
  const [videoReady, setVideoReady] = useState(false)
  const [data, setData] = useState<FormPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setVideoReady(false)
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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const title = data?.name || exerciseName
  const mediaSrc = `/api/exercises/form/media?${new URLSearchParams({ name: exerciseName })}`
  const showVideo = Boolean(!data?.error && (loading || data?.hasVideo))
  const showSpinner = loading || (showVideo && data?.hasVideo && !videoReady)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 160,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: `calc(${layout.topBarHeight}px + env(safe-area-inset-top, 0px) + 8px)`,
        paddingRight: 12,
        paddingBottom: `calc(${layout.bottomNavHeight}px + env(safe-area-inset-bottom, 0px) + 8px)`,
        paddingLeft: 12,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          height: '100%',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: colors.bgElevated,
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: radius.lg,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'flex-start',
            flexShrink: 0,
            padding: `${spacing[4]}px ${spacing[4]}px 0`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: colors.accent }}>
              FORM
            </p>
            <h2
              id={titleId}
              style={{
                margin: '4px 0 0',
                fontSize: 20,
                color: colors.textPrimary,
                overflowWrap: 'anywhere',
                lineHeight: 1.25,
              }}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            autoFocus
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.full,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgCard,
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {showVideo || showSpinner ? (
          <div
            style={{
              position: 'relative',
              flexShrink: 0,
              width: 'calc(100% - 40px)',
              margin: '14px 20px 0',
              aspectRatio: '16 / 9',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#000',
            }}
          >
            {showVideo && data?.hasVideo ? (
              <video
                controls
                playsInline
                preload="auto"
                onLoadedData={() => setVideoReady(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: '#000',
                }}
                src={mediaSrc}
              />
            ) : null}
            {showSpinner ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'rgba(0,0,0,0.55)',
                  color: colors.textSecondary,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <Loader2 size={28} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
                Loading form…
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            marginTop: 12,
            padding: `0 ${spacing[4]}px ${spacing[4]}px`,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {data?.error ? (
            <p style={{ margin: 0, color: colors.danger }}>{data.error}</p>
          ) : !loading && !data?.configured ? (
            <p style={{ margin: 0, color: colors.textSecondary, lineHeight: 1.45 }}>
              Form videos are not connected yet. Follow your coach&apos;s notes, or ask in chat.
            </p>
          ) : !loading && (data?.skipped || !data?.found) ? (
            <p style={{ margin: 0, color: colors.textSecondary, lineHeight: 1.45 }}>
              No form video for this move. Follow your coach&apos;s notes, or ask in chat.
            </p>
          ) : !loading && data?.found ? (
            <>
              {data.muscles.length > 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
                  {data.muscles.join(' · ')}
                </p>
              ) : null}
              {data.steps.length > 0 ? (
                <ol
                  style={{
                    margin: data.muscles.length > 0 ? '12px 0 0' : 0,
                    paddingLeft: 18,
                    color: colors.textSecondary,
                    fontSize: 14,
                    lineHeight: 1.55,
                  }}
                >
                  {data.steps.map((step, index) => (
                    <li key={`${index}-${step.slice(0, 24)}`} style={{ marginBottom: 10 }}>
                      {step}
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ margin: 0, color: colors.textSecondary }}>
                  Video only — no written cues for this one.
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
