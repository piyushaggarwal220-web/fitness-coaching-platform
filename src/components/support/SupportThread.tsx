'use client'

import type { SupportMessage } from '@/types/database'
import { formatSupportDate } from '@/lib/support'
import { colors } from '@/lib/design-tokens'
import { supportStyles as s } from './styles'

type SupportThreadProps = {
  messages: SupportMessage[]
  viewer: 'client' | 'coach' | 'admin'
}

export function SupportThread({ messages, viewer }: SupportThreadProps) {
  if (messages.length === 0) {
    return <p style={{ color: colors.textMuted, fontSize: 14 }}>No messages yet.</p>
  }

  return (
    <div style={s.thread}>
      {messages.map((msg) => {
        const isMine =
          viewer !== 'admin' &&
          ((viewer === 'client' && msg.sender_type === 'client') ||
            (viewer === 'coach' && msg.sender_type === 'coach'))

        const senderLabel =
          viewer === 'admin'
            ? msg.sender_type === 'coach'
              ? 'Coach'
              : 'Client'
            : msg.sender_type === 'coach'
              ? 'Coach'
              : 'You'

        return (
          <div
            key={msg.id}
            style={{
              ...(isMine ? s.bubbleCoach : s.bubbleClient),
              alignSelf: isMine ? 'flex-end' : 'flex-start',
            }}
          >
            <div>{msg.message}</div>
            <div style={s.bubbleMeta}>
              {senderLabel} · {formatSupportDate(msg.created_at)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
