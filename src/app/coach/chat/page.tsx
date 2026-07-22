'use client'

import Link from 'next/link'
import { CoachShell } from '@/components/ui/CoachShell'
import { brandTitle } from '@/lib/brand'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { formatRelativeActivity } from '@/lib/coach-chat-ui'
import { colors, shadows } from '@/lib/coach-theme'
import { useCoachConversationList } from '@/hooks/useCoachConversationList'

export default function CoachChatListPage() {
  const { conversations, loading, error, retry, reload } = useCoachConversationList({
    realtimeScope: 'chat-list',
  })

  if (loading) return <CoachShell loading />

  return (
    <CoachShell>
      <h1 style={styles.title}>{brandTitle('Client Conversations')}</h1>
      <p style={styles.subtitle}>Active coaching conversations with your clients.</p>

      {error ? (
        <div style={styles.empty}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: colors.textPrimary }}>
            Conversations could not be loaded
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>{error}</p>
          <button
            type="button"
            onClick={() => {
              if (error.toLowerCase().includes('session')) retry()
              else reload()
            }}
            style={{
              border: `1px solid ${colors.accent}`,
              background: colors.accentMuted,
              color: colors.accent,
              borderRadius: 999,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: colors.textPrimary }}>No active conversations yet</p>
          <p style={{ margin: 0, fontSize: 14 }}>Clients will appear here when they start a chat.</p>
        </div>
      ) : (
        conversations.map((conv) => {
          const profile = conv.profiles
          const name = profile?.name || profile?.email || 'Client'
          const unread = (conv.unread_by_coach ?? 0) > 0
          return (
            <Link key={conv.id} href={`/coach/chat/${conv.id}`} style={{ textDecoration: 'none' }}>
              <div className="card-hover" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                marginBottom: 12,
                borderRadius: 16,
                border: `1px solid ${unread ? 'rgba(249,115,22,0.3)' : colors.borderSubtle}`,
                backgroundColor: unread ? colors.accentMuted : colors.bgCard,
                boxShadow: shadows.sm,
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: colors.bgElevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  color: colors.accent,
                }}>
                  {(name[0] ?? 'C').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>{name}</span>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>{formatRelativeActivity(conv.last_message_at)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conv.last_message_preview ?? 'No messages yet'}
                  </p>
                </div>
                {unread && (
                  <span style={{ backgroundColor: colors.accent, color: colors.textInverse, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                    {conv.unread_by_coach}
                  </span>
                )}
              </div>
            </Link>
          )
        })
      )}
    </CoachShell>
  )
}
