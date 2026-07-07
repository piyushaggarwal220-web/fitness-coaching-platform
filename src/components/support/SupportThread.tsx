'use client'

import type { SupportMessage } from '@/types/database'
import { formatSupportDate } from '@/lib/support'
import { supportStyles as s } from './styles'

type SupportThreadProps = {
  messages: SupportMessage[]
  viewer: 'client' | 'coach'
}

export function SupportThread({ messages, viewer }: SupportThreadProps) {
  if (messages.length === 0) {
    return <p style={{ color: '#666', fontSize: 14 }}>No messages yet.</p>
  }

  return (
    <div style={s.thread}>
      {messages.map((msg) => {
        const isMine =
          (viewer === 'client' && msg.sender_type === 'client') ||
          (viewer === 'coach' && msg.sender_type === 'coach')

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
              {msg.sender_type === 'coach' ? 'Coach' : 'You'} · {formatSupportDate(msg.created_at)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
