'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { ConversationMessage } from '@/types/database'
import { formatMessageTime } from '@/lib/coach-chat'
import { CoachReplyRatingPrompt } from '@/components/chat/CoachReplyRating'
import { VoicePlayer } from '@/components/chat/VoicePlayer'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'
import { colors } from '@/lib/design-tokens'

type CoachChatThreadProps = {
  conversationId: string
  coachId: string
  viewer: 'client' | 'coach'
  initialMessages?: ConversationMessage[]
}

export function CoachChatThread({ conversationId, coachId, viewer, initialMessages = [] }: CoachChatThreadProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [coachTyping, setCoachTyping] = useState(false)
  const [error, setError] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/chat/messages?conversationId=${conversationId}`)
    const data = await res.json()
    if (data.messages) setMessages(data.messages)
  }, [conversationId])

  useEffect(() => {
    void fetchMessages()
    pollRef.current = setInterval(() => void fetchMessages(), 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchMessages])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (opts?: { messageType?: string; mediaUrl?: string; mediaDurationSeconds?: number }) => {
    const content = opts?.mediaUrl ? input : input.trim()
    if (!content && !opts?.mediaUrl) return

    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          content: content || undefined,
          messageType: opts?.messageType ?? 'text',
          mediaUrl: opts?.mediaUrl,
          mediaDurationSeconds: opts?.mediaDurationSeconds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      setInput('')
      await fetchMessages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const handleTyping = () => {
    fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, typing: true }),
    }).catch(() => {})
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const path = `${user.id}/${conversationId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, file)
    if (uploadError) { setError(uploadError.message); return }

    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path)
    await sendMessage({ messageType: 'image', mediaUrl: urlData.publicUrl })
  }

  return (
    <div style={styles.wrapper}>
      <div ref={threadRef} style={styles.thread}>
        {messages.map((msg) => {
          const isMine =
            (viewer === 'client' && msg.sender_type === 'client') ||
            (viewer === 'coach' && msg.sender_type === 'coach')
          const isSystem = msg.sender_type === 'system' || msg.message_type === 'system'

          if (isSystem) {
            return (
              <div key={msg.id} style={styles.systemMsg}>
                {msg.content}
              </div>
            )
          }

          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...(isMine ? styles.bubbleMine : styles.bubbleOther) }}>
                {msg.message_type === 'voice' && msg.media_url ? (
                  <VoicePlayer url={msg.media_url} duration={msg.media_duration_seconds ?? undefined} />
                ) : msg.message_type === 'image' && msg.media_url ? (
                  <img src={msg.media_url} alt="Shared image" style={styles.image} />
                ) : (
                  <div>{msg.content}</div>
                )}
                <div style={styles.meta}>
                  {formatMessageTime(msg.created_at)}
                  {msg.read_at && isMine && ' · Read'}
                </div>
              </div>
              {viewer === 'client' && msg.sender_type === 'coach' && msg.message_type !== 'system' && (
                <CoachReplyRatingPrompt messageId={msg.id} coachId={coachId} />
              )}
            </div>
          )
        })}
        {coachTyping && viewer === 'client' && (
          <div style={styles.typing}>Coach is typing...</div>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.inputBar}>
        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} id="chat-image-upload" />
        <label htmlFor="chat-image-upload" style={styles.attachBtn} aria-label="Attach image">📷</label>
        {viewer === 'coach' && (
          <VoiceRecorder
            conversationId={conversationId}
            onSent={() => void fetchMessages()}
            onError={setError}
          />
        )}
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); handleTyping() }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }}
          placeholder="Type a message..."
          style={styles.input}
          disabled={sending}
        />
        <button type="button" onClick={() => void sendMessage()} disabled={sending || !input.trim()} style={styles.sendBtn}>
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 },
  thread: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px' },
  systemMsg: { textAlign: 'center', color: colors.textMuted, fontSize: 13, padding: '8px 16px', fontStyle: 'italic' },
  bubbleMine: { backgroundColor: colors.accent, color: colors.textInverse, borderRadius: '20px 20px 4px 20px', padding: '12px 16px', maxWidth: '80%' },
  bubbleOther: { backgroundColor: colors.bgElevated, color: colors.textPrimary, borderRadius: '20px 20px 20px 4px', padding: '12px 16px', maxWidth: '80%', border: `1px solid ${colors.borderSubtle}` },
  meta: { fontSize: 11, opacity: 0.6, marginTop: 4 },
  image: { maxWidth: '100%', borderRadius: 12, maxHeight: 200 },
  typing: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', padding: '4px 16px' },
  error: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: 8, borderRadius: 12, fontSize: 13, margin: '0 16px 8px' },
  inputBar: { display: 'flex', gap: 8, alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${colors.divider}`, backgroundColor: colors.bgCard },
  input: { flex: 1, minHeight: 48, padding: '10px 16px', border: `1px solid ${colors.borderSubtle}`, borderRadius: 24, fontSize: 16, outline: 'none', backgroundColor: colors.bgElevated, color: colors.textPrimary },
  sendBtn: { minHeight: 48, minWidth: 48, padding: '10px 20px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: 24, fontWeight: 600, cursor: 'pointer', fontSize: 15 },
  attachBtn: { minHeight: 48, minWidth: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 20, color: colors.textSecondary, backgroundColor: colors.bgElevated, borderRadius: '50%' },
}
