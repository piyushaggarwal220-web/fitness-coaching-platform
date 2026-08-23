'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FlaskConical, RefreshCw } from 'lucide-react'
import { ClientShell } from '@/components/ui/ClientShell'
import { Card } from '@/components/ui/Card'
import { authenticateClient } from '@/lib/onboarding'
import { colors, spacing } from '@/lib/design-tokens'
import { mobileStyles } from '@/lib/mobile-styles'
import { createClient } from '@/lib/supabase/client'
import {
  ADDON_PROTOCOL_PAGE_TITLE,
  ADDON_PROTOCOL_SUBTITLE,
  parseAddonProtocolId,
} from '@/lib/addon-protocols'

const supabase = createClient()

type ProtocolResponse = {
  entitled: boolean
  status: 'none' | 'ready' | 'pending' | 'failed' | 'awaiting_onboarding'
  content: string | null
  version?: number
  generatedAt?: string | null
  message?: string
}

/** Minimal renderer for the headings, bullets, and paragraphs the protocol is written in. */
function ProtocolBody({ content }: { content: string }) {
  const blocks = content.split('\n')

  return (
    <div style={{ fontSize: 15, lineHeight: 1.65, color: colors.textSecondary }}>
      {blocks.map((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={index} style={{ height: spacing[2] }} />

        if (trimmed.startsWith('## ')) {
          return (
            <h2
              key={index}
              style={{
                margin: `${spacing[5]}px 0 ${spacing[2]}px`,
                fontSize: 17,
                fontWeight: 800,
                color: colors.textPrimary,
              }}
            >
              {trimmed.replace(/^##\s+/, '')}
            </h2>
          )
        }

        if (trimmed.startsWith('# ')) {
          return (
            <h1
              key={index}
              style={{
                margin: `${spacing[4]}px 0 ${spacing[2]}px`,
                fontSize: 19,
                fontWeight: 800,
                color: colors.textPrimary,
              }}
            >
              {trimmed.replace(/^#\s+/, '')}
            </h1>
          )
        }

        if (/^([-*]|\d+\.)\s+/.test(trimmed)) {
          return (
            <div key={index} style={{ display: 'flex', gap: spacing[2], marginBottom: 6 }}>
              <span style={{ color: colors.accent, flexShrink: 0 }}>•</span>
              <span>{trimmed.replace(/^([-*]|\d+\.)\s+/, '').replace(/\*\*/g, '')}</span>
            </div>
          )
        }

        return (
          <p key={index} style={{ margin: `0 0 ${spacing[2]}px` }}>
            {trimmed.replace(/\*\*/g, '')}
          </p>
        )
      })}
    </div>
  )
}

function SupplementProtocolInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const addonId = parseAddonProtocolId(searchParams.get('addon'))
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [data, setData] = useState<ProtocolResponse | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (method: 'GET' | 'POST' = 'GET') => {
    setError('')
    try {
      const res = await fetch(`/api/supplement-protocol?addon=${encodeURIComponent(addonId)}`, { method })
      const json = (await res.json()) as ProtocolResponse & { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not load your protocol.')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your protocol.')
    }
  }, [addonId])

  useEffect(() => {
    const init = async () => {
      const auth = await authenticateClient(supabase, router, { requirePayment: true })
      if (!auth?.profile) return
      await load()
      setLoading(false)
    }
    void init()
  }, [router, load])

  const handleRetry = async () => {
    setRetrying(true)
    await load('POST')
    setRetrying(false)
  }

  const generatedLabel = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  return (
    <ClientShell loading={loading} title={ADDON_PROTOCOL_PAGE_TITLE[addonId]}>
      <p
        style={{
          margin: `0 0 ${spacing[4]}px`,
          fontSize: 13,
          color: colors.textMuted,
        }}
      >
        {generatedLabel
          ? `${ADDON_PROTOCOL_SUBTITLE[addonId]} · ${generatedLabel}`
          : ADDON_PROTOCOL_SUBTITLE[addonId]}
      </p>

      {error && <div style={{ ...mobileStyles.error, marginBottom: spacing[4] }}>{error}</div>}

      {data && !data.entitled && (
        <Card variant="glass">
          <div style={{ display: 'flex', gap: spacing[3], alignItems: 'flex-start' }}>
            <FlaskConical size={22} color={colors.accent} aria-hidden />
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: colors.textPrimary }}>
                Not part of your plan
              </p>
              <p style={{ margin: `6px 0 0`, fontSize: 14, color: colors.textSecondary }}>
                The natural testosterone support protocol is an optional add-on. Your coach can
                still answer training, sleep and supplement questions in chat any time.
              </p>
            </div>
          </div>
        </Card>
      )}

      {data?.entitled && data.status === 'ready' && data.content && (
        <Card variant="glass">
          <ProtocolBody content={data.content} />
          <p
            style={{
              margin: `${spacing[5]}px 0 0`,
              paddingTop: spacing[3],
              borderTop: `1px solid ${colors.borderSubtle}`,
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            Lifestyle and nutrition guidance only. Not medical advice, and not hormone therapy.
            Check with your doctor before starting anything new, especially if you take medication,
            have a health condition, or suspect genuinely low testosterone.
          </p>
        </Card>
      )}

      {data?.entitled && data.status !== 'ready' && (
        <Card variant="glass">
          <p style={{ margin: 0, fontWeight: 700, color: colors.textPrimary }}>
            {data.status === 'awaiting_onboarding'
              ? 'Waiting on your onboarding answers'
              : 'Your protocol is being prepared'}
          </p>
          <p style={{ margin: `6px 0 0`, fontSize: 14, color: colors.textSecondary }}>
            {data.message ?? 'Check back shortly.'}
          </p>
          {data.status !== 'awaiting_onboarding' && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              style={{
                marginTop: spacing[4],
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing[2],
                padding: `10px ${spacing[4]}px`,
                borderRadius: 12,
                border: 'none',
                backgroundColor: colors.accentMuted,
                color: colors.accent,
                fontSize: 14,
                fontWeight: 700,
                cursor: retrying ? 'default' : 'pointer',
                opacity: retrying ? 0.6 : 1,
              }}
            >
              <RefreshCw size={16} aria-hidden />
              {retrying ? 'Checking…' : 'Try again'}
            </button>
          )}
        </Card>
      )}
    </ClientShell>
  )
}

export default function SupplementProtocolPage() {
  return (
    <Suspense fallback={<ClientShell loading title="Protocol" />}>
      <SupplementProtocolInner />
    </Suspense>
  )
}

