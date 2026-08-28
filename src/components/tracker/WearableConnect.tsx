'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Watch } from 'lucide-react'
import { trackerInputStyle, trackerSurface } from '@/components/tracker/TrackerPrimitives'
import { Button } from '@/components/ui/Button'
import { colors, radius, spacing } from '@/lib/design-tokens'
import type { TrackerCompletion } from '@/lib/daily-tracker/types'
import {
  type WearableSource,
  WEARABLE_OPTIONS,
  readStoredWearableSource,
  wearableHelp,
  wearableLabel,
  writeStoredWearableSource,
} from '@/lib/wearables'

type Variant = 'hub' | 'steps' | 'sleep'

type Props = {
  variant: Variant
  completion: TrackerCompletion
  saving?: boolean
  onPatch: (patch: TrackerCompletion) => Promise<boolean>
  stepsId?: string
  stepsTarget?: number
}

type FitbitStatus = {
  fitbitConfigured: boolean
  fitbitConnected: boolean
}

function localDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fitbitBanner(code: string | null): string | null {
  if (!code) return null
  if (code === 'connected') return 'Fitbit connected. Pull today\'s steps or sleep below.'
  if (code === 'not_configured') return 'Fitbit browser connect is not live yet. You can still enter today\'s numbers from the Fitbit app.'
  if (code === 'denied') return 'Fitbit access was not granted.'
  if (code === 'bad_state' || code === 'missing_code' || code === 'token_failed') {
    return 'Could not finish Fitbit connect. Try again.'
  }
  return null
}

export function WearableConnect({
  variant,
  completion,
  saving,
  onPatch,
  stepsId,
  stepsTarget = 10000,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const stored = readStoredWearableSource()
  const [source, setSource] = useState<WearableSource | null>(
    completion.wearable?.source ?? stored
  )
  const [importValue, setImportValue] = useState('')
  const [status, setStatus] = useState<FitbitStatus | null>(null)
  const [pulling, setPulling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const next = completion.wearable?.source
    if (next) setSource(next)
  }, [completion.wearable?.source])

  useEffect(() => {
    const banner = fitbitBanner(new URLSearchParams(window.location.search).get('fitbit'))
    if (banner) setMessage(banner)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/wearables/status', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data: FitbitStatus) => {
        if (!cancelled && typeof data?.fitbitConfigured === 'boolean') setStatus(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const help = useMemo(() => (source ? wearableHelp(source) : null), [source])

  const choose = (next: WearableSource) => {
    setSource(next)
    writeStoredWearableSource(next)
    setMessage(null)
    void onPatch({
      wearable: {
        source: next,
        lastImportedAt: completion.wearable?.lastImportedAt,
        lastImportedKind: completion.wearable?.lastImportedKind,
      },
    })
  }

  const importNow = () => {
    if (!source) return
    const parsed = Number(importValue)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setMessage('Enter a number from your watch.')
      return
    }
    const stamp = new Date().toISOString()
    if (variant === 'sleep') {
      void onPatch({
        sleep: { hours: Math.round(parsed * 10) / 10 },
        wearable: { source, lastImportedAt: stamp, lastImportedKind: 'sleep' },
      })
      setMessage(`Logged ${parsed}h from ${wearableLabel(source)}.`)
      return
    }
    if (!stepsId) return
    void onPatch({
      cardio: { [stepsId]: { actual: Math.round(parsed), completed: parsed >= stepsTarget } },
      wearable: { source, lastImportedAt: stamp, lastImportedKind: 'steps' },
    })
    setMessage(`Logged ${Math.round(parsed).toLocaleString()} steps from ${wearableLabel(source)}.`)
  }

  const pullFitbit = async () => {
    if (!source || source !== 'fitbit') return
    setPulling(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/wearables/fitbit/today?date=${localDate()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = (await res.json().catch(() => null)) as {
        steps?: number | null
        sleepHours?: number | null
        error?: string
        needsConnect?: boolean
      } | null
      if (data?.needsConnect) {
        setMessage('Connect Fitbit to pull automatically, or enter today\'s numbers.')
        return
      }
      if (!res.ok) {
        setMessage(data?.error ?? 'Could not read Fitbit today.')
        return
      }
      const stamp = new Date().toISOString()
      if (variant === 'sleep' && data?.sleepHours != null) {
        void onPatch({
          sleep: { hours: data.sleepHours },
          wearable: { source: 'fitbit', lastImportedAt: stamp, lastImportedKind: 'sleep' },
        })
        setMessage(`Pulled ${data.sleepHours}h sleep from Fitbit.`)
        return
      }
      if (variant !== 'sleep' && stepsId && data?.steps != null) {
        void onPatch({
          cardio: { [stepsId]: { actual: data.steps, completed: data.steps >= stepsTarget } },
          wearable: { source: 'fitbit', lastImportedAt: stamp, lastImportedKind: 'steps' },
        })
        setMessage(`Pulled ${data.steps.toLocaleString()} steps from Fitbit.`)
        return
      }
      setMessage('Fitbit had no data for today yet.')
    } catch {
      setMessage('Could not reach Fitbit.')
    } finally {
      setPulling(false)
    }
  }

  const connectFitbit = () => {
    writeStoredWearableSource('fitbit')
    window.location.href = '/api/wearables/fitbit/connect'
  }

  const clearFitbitQuery = () => {
    if (typeof window === 'undefined') return
    if (!new URLSearchParams(window.location.search).get('fitbit')) return
    router.replace(pathname)
  }

  const importLabel = variant === 'sleep' ? 'Hours from watch' : 'Steps from watch'
  const showImport = variant !== 'hub' && source

  return (
    <div
      style={{
        ...trackerSurface,
        borderRadius: radius.lg,
        padding: spacing[4],
        marginTop: variant === 'hub' ? spacing[5] : spacing[4],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: spacing[3] }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: colors.accentMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Watch size={20} color={colors.accent} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Connect a watch</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
            Apple Watch, Galaxy Watch, or Fitbit
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {WEARABLE_OPTIONS.map((option) => {
          const active = source === option.id
          return (
            <button
              key={option.id}
              type="button"
              disabled={saving}
              onClick={() => choose(option.id)}
              style={{
                minHeight: 48,
                padding: '8px 6px',
                borderRadius: 12,
                border: `1px solid ${active ? 'rgba(249,115,22,0.45)' : colors.borderSubtle}`,
                background: active ? colors.accentMuted : 'rgba(255,255,255,0.04)',
                color: active ? colors.accent : colors.textSecondary,
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {option.short}
            </button>
          )
        })}
      </div>

      {help && (
        <p style={{ margin: `${spacing[3]}px 0 0`, fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
          {help}
        </p>
      )}

      {source === 'fitbit' && status?.fitbitConfigured && (
        <Button
          variant={status.fitbitConnected ? 'secondary' : 'primary'}
          fullWidth
          disabled={saving || pulling}
          onClick={connectFitbit}
          style={{ marginTop: spacing[3] }}
        >
          {status.fitbitConnected ? 'Reconnect Fitbit' : 'Connect Fitbit'}
        </Button>
      )}

      {showImport && (
        <>
          <label style={{ display: 'block', marginTop: spacing[3] }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>{importLabel}</span>
            <input
              type="number"
              min={0}
              step={variant === 'sleep' ? 0.5 : 1}
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              placeholder={variant === 'sleep' ? '7.5' : '8432'}
              style={{ ...trackerInputStyle, marginTop: 8 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" fullWidth disabled={saving || pulling} onClick={importNow}>
              Save from {source ? wearableLabel(source) : 'watch'}
            </Button>
            {source === 'fitbit' && status?.fitbitConnected && (
              <Button variant="primary" fullWidth disabled={saving || pulling} onClick={() => void pullFitbit()}>
                {pulling ? 'Pulling…' : 'Pull Fitbit'}
              </Button>
            )}
          </div>
        </>
      )}

      {message && (
        <p
          style={{ margin: `${spacing[3]}px 0 0`, fontSize: 12, color: colors.accent, lineHeight: 1.45 }}
          onClick={clearFitbitQuery}
        >
          {message}
        </p>
      )}
    </div>
  )
}
