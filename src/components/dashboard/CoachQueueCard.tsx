'use client'

import { useCallback, useEffect, useState } from 'react'
import { ListOrdered } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { readApiJson } from '@/lib/api-response'
import type { ClientCoachQueueView } from '@/lib/client-coach-queue'
import { colors, spacing } from '@/lib/design-tokens'

type Props = {
  compact?: boolean
}

export function CoachQueueCard({ compact = false }: Props) {
  const [queue, setQueue] = useState<ClientCoachQueueView | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/client/coach-queue', { credentials: 'include', cache: 'no-store' })
      const parsed = await readApiJson<{ success?: boolean; queue?: ClientCoachQueueView; error?: string }>(res)
      if (!parsed.ok) {
        setError(parsed.error || 'Could not load your coach’s queue.')
        return
      }
      if (!parsed.data.queue) {
        setError(parsed.data.error || 'Could not load your coach’s queue.')
        return
      }
      setError('')
      setQueue(parsed.data.queue)
    } catch {
      setError('Could not load your coach’s queue.')
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  if (error && !queue) {
    if (compact) return null
    return null
  }
  if (!queue || !queue.eligible) return null

  if (compact) {
    return (
      <div
        style={{
          margin: '0 12px 8px',
          padding: '10px 12px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#e9edef' }}>
          Your coach will call you this week
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#aebac1', lineHeight: 1.4 }}>
          {queue.message}
        </p>
        {queue.items.length > 0 ? (
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#e9edef' }}>
            {queue.items.slice(0, 6).map((item) => (
              <li
                key={`${item.position}-${item.type}`}
                style={{
                  marginBottom: 2,
                  fontWeight: item.yours ? 700 : 400,
                  color: item.yours ? '#53d769' : '#aebac1',
                }}
              >
                {item.label}
                {item.yours ? ' · you' : ''}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    )
  }

  return (
    <Card
      variant="glass"
      style={{
        marginBottom: spacing[4],
        border: '1px solid rgba(249,115,22,0.22)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.accentMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ListOrdered size={20} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.accent,
            }}
          >
            Coach work queue
          </p>
          <h2 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>
            Your coach will call you this week
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
            {queue.message}
          </p>
          {queue.items.length > 0 ? (
            <ol
              style={{
                margin: '14px 0 0',
                padding: 0,
                listStyle: 'none',
                display: 'grid',
                gap: 8,
              }}
            >
              {queue.items.map((item) => (
                <li
                  key={`${item.position}-${item.type}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: item.yours ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                    border: item.yours
                      ? '1px solid rgba(34,197,94,0.35)'
                      : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      color: item.yours ? '#86efac' : colors.textMuted,
                      background: item.yours ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                      flexShrink: 0,
                    }}
                  >
                    {item.position}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: item.yours ? 700 : 500,
                      color: item.yours ? colors.textPrimary : colors.textSecondary,
                    }}
                  >
                    {item.label}
                    {item.yours ? ' · you' : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
