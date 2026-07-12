'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationMessage } from '@/types/database'
import { formatMessageTime } from '@/lib/coach-chat'
import { CoachReplyRatingPrompt } from '@/components/chat/CoachReplyRating'
import { VoicePlayer } from '@/components/chat/VoicePlayer'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'

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

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', maxHeight: 700 },
  thread: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0' },
  systemMsg: { textAlign: 'center', color: '#888', fontSize: 13, padding: '8px 16px', fontStyle: 'italic' },
  bubbleMine: { backgroundColor: '#e94560', color: 'white', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', maxWidth: '80%' },
  bubbleOther: { backgroundColor: '#f0f0f0', color: '#1a1a2e', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', maxWidth: '80%' },
  meta: { fontSize: 11, opacity: 0.7, marginTop: 4 },
  image: { maxWidth: '100%', borderRadius: 8, maxHeight: 200 },
  typing: { color: '#888', fontSize: 13, fontStyle: 'italic', padding: '4px 8px' },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 8, borderRadius: 8, fontSize: 13, marginBottom: 8 },
  inputBar: { display: 'flex', gap: 8, alignItems: 'center', padding: '12px 0', borderTop: '1px solid #eee' },
  input: { flex: 1, minHeight: 48, padding: '10px 14px', border: '1px solid #ddd', borderRadius: 24, fontSize: 16, outline: 'none' },
  sendBtn: { minHeight: 48, minWidth: 48, padding: '10px 20px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 24, fontWeight: 600, cursor: 'pointer', fontSize: 15 },
  attachBtn: { minHeight: 48, minWidth: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 20 },
}
