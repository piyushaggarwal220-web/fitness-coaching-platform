'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Play, X } from 'lucide-react'
import { clientColors as colors, layout, radius, spacing } from '@/lib/design-tokens'
import type { FormDemoGender } from '@/lib/exercise-form/musclewiki'

type VideoOption = { gender: FormDemoGender; angle: string; hasPoster?: boolean }

type FormPayload = {
  configured: boolean
  skipped: boolean
  found: boolean
  name: string | null
  steps: string[]
  muscles: string[]
  category: string | null
  difficulty: string | null
  force: string | null
  mechanic: string | null
  grips: string[]
  preferredGender?: FormDemoGender
  videos: VideoOption[]
  exerciseId: number | null
  hasVideo: boolean
  locked?: boolean
  entitled?: boolean
  freeUnlock?: boolean
  freeUsed?: number
  freeRemaining?: number
  freeCap?: number
  pricePaise?: number
  error?: string
}

type Props = {
  exerciseName: string
  onClose: () => void
}

function Chip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        background: colors.accentMuted,
        color: colors.accent,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  )
}

function angleLabel(angle: string) {
  return angle.replace(/[-_]/g, ' ')
}

function orderAngles(angles: string[]): string[] {
  const rank = ['front', 'side', 'rear', 'back', '45']
  const unique = [...new Set(angles.map((angle) => angle.toLowerCase() || 'front'))]
  return unique.sort((a, b) => {
    const ia = rank.indexOf(a)
    const ib = rank.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })
}

function FormAnglePlayer({
  exerciseName,
  gender,
  angle,
  autoLoad,
  onPlaying,
}: {
  exerciseName: string
  gender: FormDemoGender
  angle: string
  autoLoad: boolean
  onPlaying: (video: HTMLVideoElement) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [activated, setActivated] = useState(autoLoad)
  const [ready, setReady] = useState(false)
  const mediaSrc = `/api/exercises/form/media?${new URLSearchParams({
    name: exerciseName,
    gender,
    angle,
  })}`

  useEffect(() => {
    if (!activated || autoLoad) return
    const video = videoRef.current
    if (!video) return
    void video.play().catch(() => {
      /* user gesture may still be required on some browsers */
    })
  }, [activated, autoLoad])

  return (
    <div>
      <p
        style={{
          margin: '0 0 6px',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {angleLabel(angle)}
      </p>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000',
        }}
      >
        {activated ? (
          <video
            ref={videoRef}
            controls
            playsInline
            preload={autoLoad ? 'auto' : 'none'}
            onLoadedData={() => setReady(true)}
            onPlay={(event) => onPlaying(event.currentTarget)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: '#000',
            }}
            src={mediaSrc}
          />
        ) : (
          <button
            type="button"
            onClick={() => setActivated(true)}
            aria-label={`Load ${angleLabel(angle)} form video`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: 0,
              background: 'transparent',
              color: colors.textSecondary,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: colors.accent,
                color: colors.textInverse,
              }}
            >
              <Play size={22} fill="currentColor" />
            </span>
            Tap to load {angleLabel(angle)}
          </button>
        )}
        {activated && !ready ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'rgba(0,0,0,0.45)',
              color: colors.textSecondary,
              fontSize: 13,
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            <Loader2 size={24} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
            Loading {angleLabel(angle)}…
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ExerciseFormSheet({ exerciseName, onClose }: Props) {
  const titleId = useId()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<FormPayload | null>(null)
  const activeVideoRef = useRef<HTMLVideoElement | null>(null)

  const loadForm = useCallback(() => {
    let cancelled = false
    setLoading(true)
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
            category: null,
            difficulty: null,
            force: null,
            mechanic: null,
            grips: [],
            videos: [],
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

  useEffect(() => loadForm(), [loadForm])

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

  const gender: FormDemoGender = data?.preferredGender === 'female' ? 'female' : 'male'
  const angles = useMemo(
    () => orderAngles((data?.videos ?? []).map((item) => item.angle)),
    [data?.videos]
  )
  const title = data?.name || exerciseName
  const showPlayers = Boolean(!data?.error && data?.hasVideo && angles.length > 0)
  const metaChips = [
    data?.category,
    data?.difficulty,
    data?.force,
    data?.mechanic,
    ...(data?.grips ?? []).map((grip) => `${grip} grip`),
  ].filter((value): value is string => Boolean(value))

  const handlePlaying = (video: HTMLVideoElement) => {
    const previous = activeVideoRef.current
    if (previous && previous !== video && !previous.paused) previous.pause()
    activeVideoRef.current = video
  }

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
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#38bdf8' }}>
              HOW TO DO THIS
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
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                minHeight: 160,
                color: colors.textSecondary,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <Loader2 size={28} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
              Loading form…
            </div>
          ) : data?.error ? (
            <p style={{ margin: 0, color: colors.danger }}>{data.error}</p>
          ) : !data?.configured ? (
            <p style={{ margin: 0, color: colors.textSecondary, lineHeight: 1.45 }}>
              Form videos are not connected yet. Follow your coach&apos;s notes, or ask in chat.
            </p>
          ) : data?.skipped || !data?.found ? (
            <p style={{ margin: 0, color: colors.textSecondary, lineHeight: 1.45 }}>
              No form video for this move. Follow your coach&apos;s notes, or ask in chat.
            </p>
          ) : (
            <>
              {showPlayers ? (
                <div style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
                  {angles.map((angle, index) => (
                    <FormAnglePlayer
                      key={angle}
                      exerciseName={exerciseName}
                      gender={gender}
                      angle={angle}
                      autoLoad={index === 0}
                      onPlaying={handlePlaying}
                    />
                  ))}
                </div>
              ) : null}

              {metaChips.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {metaChips.map((label) => (
                    <Chip key={label} label={label} />
                  ))}
                </div>
              ) : null}

              {data.muscles.length > 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
                  {data.muscles.join(' · ')}
                </p>
              ) : null}
              {data.steps.length > 0 ? (
                <ol
                  style={{
                    margin: data.muscles.length > 0 || metaChips.length > 0 ? '12px 0 0' : 0,
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
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
