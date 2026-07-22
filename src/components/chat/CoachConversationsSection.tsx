'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatRelativeActivity } from '@/lib/coach-chat-ui'
import { colors } from '@/lib/coach-theme'
import { useCoachConversationList } from '@/hooks/useCoachConversationList'

function ClientAvatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? 'C').toUpperCase()
  return (
    <div style={{
      width: 48,
      height: 48,
      borderRadius: '50%',
      background: `linear-gradient(135deg, ${colors.accentMuted} 0%, ${colors.bgElevated} 100%)`,
      border: `1px solid rgba(249,115,22,0.25)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      color: colors.accent,
      flexShrink: 0,
    }}>
      {initial}
    </div>
  )
}

export function CoachConversationsSection() {
  const router = useRouter()
  const { conversations, loading, error, retry, reload } = useCoachConversationList({
    realtimeScope: 'conversation-section',
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 72, borderRadius: 16 }} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'grid', gap: 8, padding: '8px 0' }}>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>{error}</p>
        <button
          type="button"
          onClick={() => {
            if (error.toLowerCase().includes('session')) retry()
            else reload()
          }}
          style={{
            justifySelf: 'start',
            border: `1px solid ${colors.accent}`,
            background: colors.accentMuted,
            color: colors.accent,
            borderRadius: 999,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <p style={{ margin: 0, color: colors.textMuted, fontSize: 14, padding: '8px 0' }}>
        No conversations yet. Clients appear here when they message you.
      </p>
    )
  }

  const unreadFirst = [...conversations].sort((a, b) => {
    const aUnread = (a.unread_by_coach ?? 0) > 0 ? 1 : 0
    const bUnread = (b.unread_by_coach ?? 0) > 0 ? 1 : 0
    if (aUnread !== bUnread) return bUnread - aUnread
    return new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {unreadFirst.slice(0, 6).map((conv) => {
        const profile = conv.profiles
        const name = profile?.name || profile?.email || 'Client'
        const unread = (conv.unread_by_coach ?? 0) > 0
        return (
          <button
            key={conv.id}
            type="button"
            onClick={() => router.push(`/coach/chat/${conv.id}`)}
            className="card-hover"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              borderRadius: 16,
              border: `1px solid ${unread ? 'rgba(249,115,22,0.3)' : colors.borderSubtle}`,
              backgroundColor: unread ? colors.accentMuted : colors.bgElevated,
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <ClientAvatar name={name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: colors.textPrimary, fontSize: 15 }}>{name}</span>
                <span style={{ fontSize: 12, color: colors.textMuted, flexShrink: 0 }}>
                  {formatRelativeActivity(conv.last_message_at)}
                </span>
              </div>
              <p style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: unread ? colors.textPrimary : colors.textMuted,
                fontWeight: unread ? 500 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {conv.last_message_preview ?? 'No messages yet'}
              </p>
            </div>
            {unread && (
              <span style={{
                backgroundColor: colors.accent,
                color: colors.textInverse,
                borderRadius: 999,
                minWidth: 22,
                height: 22,
                padding: '0 7px',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {conv.unread_by_coach}
              </span>
            )}
          </button>
        )
      })}
      {conversations.length > 6 && (
        <Link href="/coach/chat" style={{ fontSize: 14, fontWeight: 600, color: colors.accent, padding: '4px 0' }}>
          View all conversations →
        </Link>
      )}
    </div>
  )
}
