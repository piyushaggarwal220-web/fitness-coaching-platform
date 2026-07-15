'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { ConversationMessage } from '@/types/database'
import { readApiJson } from '@/lib/api-response'
import { formatMessageTime } from '@/lib/coach-chat-ui'
import { isCheckinSystemMessage } from '@/lib/checkin-chat'
import { CoachReplyRatingPrompt } from '@/components/chat/CoachReplyRating'
import { VoicePlayer } from '@/components/chat/VoicePlayer'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'
import { colors, shadows } from '@/lib/design-tokens'
import { motionClass } from '@/lib/motion'
import { Check, CheckCheck, ImageIcon, Send } from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [peerTyping, setPeerTyping] = useState(false)
  const [error, setError] = useState('')
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchMessages = useCallback(async (markRead = true) => {
    const res = await fetch(`/api/chat/messages?conversationId=${conversationId}${markRead ? '' : '&peek=1'}`, {
      credentials: 'include',
    })
    const parsed = await readApiJson<{ messages?: ConversationMessage[]; peerTyping?: boolean; error?: string }>(res)
    if (!parsed.ok) {
      setError(parsed.error)
      setLoading(false)
      return
    }
    if (parsed.data.messages) {
      setMessages(parsed.data.messages)
      setLoading(false)
    }
    if (typeof parsed.data.peerTyping === 'boolean') setPeerTyping(parsed.data.peerTyping)
  }, [conversationId])

  useEffect(() => {
    void fetchMessages()
    pollRef.current = setInterval(() => void fetchMessages(), 2500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchMessages])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const updateViewport = () => {
      document.documentElement.style.setProperty('--chat-vv-offset', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`)
    }

    vv.addEventListener('resize', updateViewport)
    vv.addEventListener('scroll', updateViewport)
    updateViewport()
    return () => {
      vv.removeEventListener('resize', updateViewport)
      vv.removeEventListener('scroll', updateViewport)
      document.documentElement.style.removeProperty('--chat-vv-offset')
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, imagePreview])

  const sendMessage = async (opts?: { messageType?: string; mediaUrl?: string; mediaDurationSeconds?: number; content?: string }) => {
    const content = opts?.content ?? (opts?.mediaUrl ? input : input.trim())
    if (!content && !opts?.mediaUrl) return

    const optimistic: ConversationMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_type: viewer,
      sender_id: viewer === 'client' ? 'self' : coachId,
      message_type: (opts?.messageType as ConversationMessage['message_type']) ?? 'text',
      content: content || null,
      media_url: opts?.mediaUrl ?? null,
      media_duration_seconds: opts?.mediaDurationSeconds ?? null,
      read_at: null,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimistic])
    setSending(true)
    setError('')
    setInput('')
    setImagePreview(null)

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          content: content || undefined,
          messageType: opts?.messageType ?? 'text',
          mediaUrl: opts?.mediaUrl,
          mediaDurationSeconds: opts?.mediaDurationSeconds,
        }),
      })
      const parsed = await readApiJson<{ success?: boolean; error?: string }>(res)
      if (!parsed.ok) throw new Error(parsed.error)
      await fetchMessages()
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setError(err instanceof Error ? err.message : 'Send failed')
      if (!opts?.mediaUrl) setInput(content)
    } finally {
      setSending(false)
    }
  }

  const handleTyping = () => {
    fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ conversationId, typing: true }),
    }).catch(() => {})
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview) URL.revokeObjectURL(imagePreview.url)
    setImagePreview({ file, url: URL.createObjectURL(file) })
    e.target.value = ''
  }

  const uploadAndSendImage = async () => {
    if (!imagePreview) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const path = `${user.id}/${conversationId}/${Date.now()}_${imagePreview.file.name}`
    const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, imagePreview.file)
    if (uploadError) { setError(uploadError.message); return }

    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path)
    await sendMessage({ messageType: 'image', mediaUrl: urlData.publicUrl })
  }

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview.url)
  }, [imagePreview])

  const peerLabel = viewer === 'client' ? 'Coach' : 'Client'

  return (
    <div className="coach-chat-thread" style={styles.wrapper}>
      <div ref={threadRef} className="coach-chat-messages" style={styles.thread}>
        {loading && (
          <div style={styles.skeletonWrap}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 52, width: i % 2 === 0 ? '70%' : '55%', alignSelf: i % 2 === 0 ? 'flex-end' : 'flex-start', borderRadius: 20 }} />
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={styles.empty}>
            <p style={{ margin: 0, fontWeight: 600, color: colors.textPrimary }}>Start the conversation</p>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textMuted }}>
              Send a message to your {viewer === 'client' ? 'coach' : 'client'}. Voice notes and photos are supported.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine =
            (viewer === 'client' && msg.sender_type === 'client') ||
            (viewer === 'coach' && msg.sender_type === 'coach')
          const isSystem = msg.sender_type === 'system' || msg.message_type === 'system'

          if (isSystem) {
            const isCheckin = isCheckinSystemMessage(msg.content)
            return (
              <div
                key={msg.id}
                className={isCheckin ? 'coach-chat-checkin' : 'coach-chat-system'}
                style={isCheckin ? styles.checkinSystemMsg : styles.systemMsg}
              >
                {isCheckin ? (
                  <pre style={styles.checkinContent}>{msg.content}</pre>
                ) : (
                  msg.content
                )}
              </div>
            )
          }

          return (
            <div key={msg.id} className={motionClass.messageEnter} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
              <div
                className={isMine ? 'coach-chat-bubble-mine' : 'coach-chat-bubble-other'}
                style={{ ...(isMine ? styles.bubbleMine : styles.bubbleOther) }}
              >
                {msg.message_type === 'voice' && msg.media_url ? (
                  <div className="coach-chat-voice">
                    <VoicePlayer
                      url={msg.media_url}
                      duration={msg.media_duration_seconds ?? undefined}
                      fromCoach={msg.sender_type === 'coach'}
                    />
                  </div>
                ) : msg.message_type === 'image' && msg.media_url ? (
                  <img src={msg.media_url} alt="Shared" style={styles.image} />
                ) : (
                  <div className="coach-chat-bubble-text" style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
                )}
                <div style={styles.meta}>
                  <span>{formatMessageTime(msg.created_at)}</span>
                  {isMine && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      {msg.read_at ? <CheckCheck size={12} /> : <Check size={12} />}
                      {msg.read_at ? 'Read' : 'Sent'}
                    </span>
                  )}
                </div>
              </div>
              {viewer === 'client' && msg.sender_type === 'coach' && msg.message_type !== 'system' && (
                <CoachReplyRatingPrompt messageId={msg.id} coachId={coachId} />
              )}
            </div>
          )
        })}

        {peerTyping && (
          <div style={styles.typing}>{peerLabel} is typing...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className={motionClass.shake} style={styles.error}>{error}</div>}

      {imagePreview && (
        <div className={motionClass.inputBarEnter} style={styles.imagePreviewBar}>
          <img src={imagePreview.url} alt="Preview" style={styles.previewThumb} />
          <button type="button" onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null) }} style={styles.previewCancel}>
            Cancel
          </button>
          <button type="button" onClick={() => void uploadAndSendImage()} disabled={sending} style={styles.previewSend}>
            Send photo
          </button>
        </div>
      )}

      <div className={`coach-chat-input-bar ${motionClass.inputBarEnter}`} style={styles.inputBar}>
        <VoiceRecorder
          conversationId={conversationId}
          onSent={() => void fetchMessages()}
          onError={setError}
        />
        <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} id={`chat-image-${conversationId}`} />
        <label htmlFor={`chat-image-${conversationId}`} style={styles.attachBtn} aria-label="Attach image">
          <ImageIcon size={20} color={colors.textSecondary} />
        </label>
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); handleTyping() }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }}
          placeholder="Message..."
          className="coach-chat-input"
          style={styles.input}
          disabled={sending}
        />
        <button type="button" onClick={() => void sendMessage()} disabled={sending || !input.trim()} className="btn-press" style={styles.sendBtn} aria-label="Send">
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    height: '100%',
    background: `linear-gradient(180deg, ${colors.bgPrimary} 0%, ${colors.bgSecondary} 100%)`,
  },
  thread: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '16px 16px 8px',
    scrollBehavior: 'smooth',
  },
  skeletonWrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 32 },
  systemMsg: { textAlign: 'center', color: colors.textMuted, fontSize: 12, padding: '6px 16px', fontStyle: 'italic', backgroundColor: colors.bgElevated, borderRadius: 999, alignSelf: 'center' },
  checkinSystemMsg: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: 16,
    padding: '14px 16px',
    margin: '4px 0',
  },
  checkinContent: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1.55,
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap',
    textAlign: 'left',
  },
  bubbleMine: {
    background: `linear-gradient(135deg, ${colors.accent} 0%, #ea580c 100%)`,
    color: colors.textInverse,
    borderRadius: '20px 20px 6px 20px',
    padding: '10px 14px',
    maxWidth: '82%',
    boxShadow: shadows.accent,
  },
  bubbleOther: {
    backgroundColor: colors.bgCard,
    color: colors.textPrimary,
    borderRadius: '20px 20px 20px 6px',
    padding: '10px 14px',
    maxWidth: '82%',
    border: `1px solid ${colors.borderSubtle}`,
    boxShadow: shadows.sm,
  },
  meta: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontSize: 10, opacity: 0.75, marginTop: 6 },
  image: { maxWidth: '100%', borderRadius: 12, maxHeight: 240, display: 'block' },
  typing: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', padding: '4px 8px' },
  error: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: 10, borderRadius: 12, fontSize: 13, margin: '0 16px 8px', flexShrink: 0 },
  inputBar: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
    padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
    borderTop: `1px solid ${colors.divider}`,
    backgroundColor: colors.bgGlass,
    backdropFilter: 'blur(20px)',
  },
  input: { flex: 1, minWidth: 0, minHeight: 44, padding: '10px 16px', border: `1px solid ${colors.borderSubtle}`, borderRadius: 24, fontSize: 16, outline: 'none', backgroundColor: colors.bgElevated, color: colors.textPrimary },
  sendBtn: { minHeight: 44, minWidth: 44, padding: 10, backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: '50%', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: shadows.accent },
  attachBtn: { minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: colors.bgElevated, borderRadius: '50%', border: `1px solid ${colors.borderSubtle}` },
  imagePreviewBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: `1px solid ${colors.divider}`, backgroundColor: colors.bgCard, flexShrink: 0 },
  previewThumb: { width: 56, height: 56, borderRadius: 10, objectFit: 'cover' },
  previewCancel: { padding: '8px 12px', border: `1px solid ${colors.borderSubtle}`, borderRadius: 12, background: 'transparent', color: colors.textSecondary, cursor: 'pointer', fontSize: 13 },
  previewSend: { padding: '8px 14px', border: 'none', borderRadius: 12, backgroundColor: colors.accent, color: colors.textInverse, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
}
