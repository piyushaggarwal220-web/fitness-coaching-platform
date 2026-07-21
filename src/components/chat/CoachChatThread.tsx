'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { CallRequest, CallRequestStatus, ConversationMessage } from '@/types/database'
import { readApiJson } from '@/lib/api-response'
import { formatMessageTime } from '@/lib/coach-chat-ui'
import { isCheckinSystemMessage } from '@/lib/checkin-chat'
import { CoachReplyRatingPrompt } from '@/components/chat/CoachReplyRating'
import { VoicePlayer } from '@/components/chat/VoicePlayer'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'
import { StorageImage } from '@/components/ui/StorageImage'
import { motionClass } from '@/lib/motion'
import { playNotificationSound, prepareNotificationSound } from '@/lib/notification-sound'
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtime'
import { getCoachResponseTarget } from '@/lib/chat-response-target'
import { CalendarClock, Check, CheckCheck, ImageIcon, Send, Smile } from 'lucide-react'

/** WhatsApp-like dark palette */
const wa = {
  bg: '#0b141a',
  pattern: '#0b141a',
  header: '#1f2c33',
  incoming: '#202c33',
  outgoing: '#005c4b',
  text: '#e9edef',
  textMuted: '#8696a0',
  meta: '#ffffff99',
  metaOutgoing: '#ffffff99',
  tick: '#53bdeb',
  tickSent: '#ffffff99',
  inputBar: '#1f2c34',
  input: '#2a3942',
  send: '#00a884',
  systemBg: '#182229',
  systemText: '#8696a0',
  danger: '#ea4335',
  dangerBg: '#3a1d1d',
}

type CoachChatThreadProps = {
  conversationId: string
  coachId: string
  viewer: 'client' | 'coach'
  initialMessages?: ConversationMessage[]
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}h ${minutes}m ${seconds}s`
}

export function CoachChatThread({ conversationId, coachId, viewer, initialMessages = [] }: CoachChatThreadProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [peerTyping, setPeerTyping] = useState(false)
  const [peerOnline, setPeerOnline] = useState(false)
  const [peerLastSeenAt, setPeerLastSeenAt] = useState<string | null>(null)
  const [callRequests, setCallRequests] = useState<CallRequest[]>([])
  const [callRequestBusy, setCallRequestBusy] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [now, setNow] = useState(0)
  const [error, setError] = useState('')
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastPeerMessageIdRef = useRef<string | null>(null)
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendingRef = useRef(false)

  const fetchMessages = useCallback(async (markRead = true) => {
    const res = await fetch(`/api/chat/messages?conversationId=${conversationId}${markRead ? '' : '&peek=1'}`, {
      credentials: 'include',
    })
    const parsed = await readApiJson<{
      messages?: ConversationMessage[]
      peerTyping?: boolean
      callRequests?: CallRequest[]
      peerLastSeenAt?: string | null
      error?: string
    }>(res)
    if (!parsed.ok) {
      setError(parsed.error)
      setLoading(false)
      return
    }
    if (parsed.data.messages) {
      const incoming = parsed.data.messages
      const latestPeer = [...incoming].reverse().find((m) => m.sender_type !== viewer)
      const latestPeerId = latestPeer?.id ?? 'none'
      if (lastPeerMessageIdRef.current !== null && latestPeer && lastPeerMessageIdRef.current !== latestPeerId) {
        playNotificationSound()
      }
      lastPeerMessageIdRef.current = latestPeerId
      setMessages(incoming)
      setLoading(false)
    }
    if (typeof parsed.data.peerTyping === 'boolean') setPeerTyping(parsed.data.peerTyping)
    if (parsed.data.callRequests) setCallRequests(parsed.data.callRequests)
    if ('peerLastSeenAt' in parsed.data) setPeerLastSeenAt(parsed.data.peerLastSeenAt ?? null)
  }, [conversationId, viewer])

  useEffect(() => {
    prepareNotificationSound()
    queueMicrotask(() => void fetchMessages())
  }, [fetchMessages])

  useSupabaseRealtimeRefresh({
    channelName: `chat:${conversationId}`,
    subscriptions: [
      { event: '*', table: 'conversation_messages', filter: `conversation_id=eq.${conversationId}` },
      { event: 'UPDATE', table: 'coach_conversations', filter: `id=eq.${conversationId}` },
      { event: '*', table: 'call_requests', filter: `conversation_id=eq.${conversationId}` },
    ],
    onRefresh: fetchMessages,
    pollIntervalMs: 45_000,
    presence: {
      key: `${viewer}:${conversationId}`,
      payload: { role: viewer, onlineAt: new Date().toISOString() },
      onSync: (state) => {
        const peerRole = viewer === 'client' ? 'coach' : 'client'
        const present = Object.values(state)
          .flat()
          .some((entry) => (entry as { role?: string }).role === peerRole)
        setPeerOnline(present)
        if (!present) void fetchMessages(false)
      },
      heartbeat: () => fetch('/api/chat/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationId }),
      }).then(() => undefined),
    },
  })

  const responseTarget = getCoachResponseTarget(messages)
  const responseDeadline = responseTarget?.deadline ?? null

  useEffect(() => {
    if (viewer !== 'client' || !responseDeadline) return
    const initialTick = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => {
      window.clearTimeout(initialTick)
      window.clearInterval(timer)
    }
  }, [responseDeadline, viewer])

  const activeCallRequest = callRequests.find(
    (request) => request.status === 'requested' || request.status === 'scheduled'
  )

  const createCallRequest = async () => {
    if (callRequestBusy) return
    setCallRequestBusy(true)
    setError('')
    try {
      const res = await fetch('/api/chat/call-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationId }),
      })
      const parsed = await readApiJson<{ request?: CallRequest }>(res)
      if (!parsed.ok) throw new Error(parsed.error)
      await fetchMessages(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a call')
    } finally {
      setCallRequestBusy(false)
    }
  }

  const updateCallRequest = async (status: CallRequestStatus) => {
    if (!activeCallRequest || callRequestBusy) return
    if (status === 'scheduled' && !scheduledFor) {
      setError('Choose a call date and time first')
      return
    }
    setCallRequestBusy(true)
    setError('')
    try {
      const res = await fetch('/api/chat/call-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: activeCallRequest.id,
          status,
          scheduledFor: status === 'scheduled' ? new Date(scheduledFor).toISOString() : undefined,
        }),
      })
      const parsed = await readApiJson<{ request?: CallRequest }>(res)
      if (!parsed.ok) throw new Error(parsed.error)
      await fetchMessages(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update call request')
    } finally {
      setCallRequestBusy(false)
    }
  }

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
    if (sendingRef.current) return
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

    sendingRef.current = true
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
      sendingRef.current = false
      setSending(false)
    }
  }

  const handleTyping = () => {
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    typingDebounceRef.current = setTimeout(() => {
      fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationId, typing: true }),
      }).catch(() => {})
    }, 400)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview) URL.revokeObjectURL(imagePreview.url)
    setImagePreview({ file, url: URL.createObjectURL(file) })
    e.target.value = ''
  }

  const uploadAndSendImage = async () => {
    if (!imagePreview || sendingRef.current) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    sendingRef.current = true
    setSending(true)
    setError('')

    try {
      const path = `${user.id}/${conversationId}/${Date.now()}_${imagePreview.file.name}`
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, imagePreview.file)
      if (uploadError) {
        setError(uploadError.message)
        return
      }

      sendingRef.current = false
      await sendMessage({ messageType: 'image', mediaUrl: path })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed')
    } finally {
      if (sendingRef.current) {
        sendingRef.current = false
        setSending(false)
      }
    }
  }

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview.url)
  }, [imagePreview])

  useEffect(() => () => {
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
  }, [])

  const peerLabel = viewer === 'client' ? 'Coach' : 'Client'
  const showSend = input.trim().length > 0 || Boolean(imagePreview)
  const remainingMs = responseDeadline && now > 0 ? responseDeadline - now : null
  const presenceText = peerOnline
    ? `${peerLabel} is online`
    : peerLastSeenAt
      ? `${peerLabel} last online ${new Date(peerLastSeenAt).toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}`
      : `${peerLabel} is offline`

  return (
    <div className="coach-chat-thread wa-chat" style={styles.wrapper}>
      <div style={styles.contextBar}>
        <span style={{ color: peerOnline ? '#53d769' : wa.textMuted }}>{presenceText}</span>
        {viewer === 'client' && (
          <button
            type="button"
            onClick={() => activeCallRequest
              ? void updateCallRequest('cancelled')
              : void createCallRequest()}
            disabled={callRequestBusy}
            style={styles.bookCallBtn}
          >
            <CalendarClock size={15} />
            {activeCallRequest
              ? activeCallRequest.status === 'scheduled'
                ? `Call scheduled ${new Date(activeCallRequest.scheduled_for!).toLocaleString('en-IN')}`
                : 'Call requested · Cancel'
              : 'Book a call'}
          </button>
        )}
      </div>

      {viewer === 'client' && remainingMs !== null && (
        <div style={{
          ...styles.responseTarget,
          color: remainingMs > 0 ? wa.textMuted : '#ffb4a9',
        }}>
          {remainingMs > 0
            ? `Coach response target: ${formatDuration(remainingMs)} remaining`
            : `Coach response target is overdue by ${formatDuration(Math.abs(remainingMs))}`}
          {' '}· This is a service target, not an emergency or absolute guarantee.
          {(responseTarget?.unansweredCount ?? 0) > 1 && ' Additional messages do not restart the timer.'}
        </div>
      )}

      {viewer === 'coach' && activeCallRequest && (
        <div style={styles.callRequestPanel}>
          <strong>Call request: {activeCallRequest.status}</strong>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.target.value)}
            style={styles.scheduleInput}
          />
          <button type="button" onClick={() => void updateCallRequest('scheduled')} disabled={callRequestBusy} style={styles.callAction}>Schedule</button>
          <button type="button" onClick={() => void updateCallRequest('completed')} disabled={callRequestBusy} style={styles.callAction}>Complete</button>
          <button type="button" onClick={() => void updateCallRequest('declined')} disabled={callRequestBusy} style={styles.callAction}>Decline</button>
          <button type="button" onClick={() => void updateCallRequest('cancelled')} disabled={callRequestBusy} style={styles.callAction}>Cancel</button>
        </div>
      )}

      <div ref={threadRef} className="coach-chat-messages wa-chat-messages" style={styles.thread}>
        <div style={styles.wallpaper} aria-hidden />

        {loading && (
          <div style={styles.skeletonWrap}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 44,
                  width: i % 2 === 0 ? '62%' : '48%',
                  alignSelf: i % 2 === 0 ? 'flex-end' : 'flex-start',
                  borderRadius: 8,
                  backgroundColor: i % 2 === 0 ? wa.outgoing : wa.incoming,
                  opacity: 0.55,
                }}
              />
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyCard}>
              Private coaching messages stay between you and your coach in this workspace.
              Send a text, photo, or voice note to start.
            </div>
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
            <div
              key={msg.id}
              className={motionClass.messageEnter}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMine ? 'flex-end' : 'flex-start',
                maxWidth: '100%',
                paddingInline: 4,
              }}
            >
              <div
                className={isMine ? 'coach-chat-bubble-mine' : 'coach-chat-bubble-other'}
                style={{
                  ...(isMine ? styles.bubbleMine : styles.bubbleOther),
                  ...(msg.message_type === 'image' ? { padding: 4 } : null),
                }}
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
                  <StorageImage bucket="chat-images" src={msg.media_url} alt="Shared" style={styles.image} />
                ) : (
                  <div
                    className="coach-chat-bubble-text"
                    style={{
                      fontSize: 14.5,
                      lineHeight: 1.4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: wa.text,
                    }}
                  >
                    {msg.content}
                  </div>
                )}
                <div style={{ ...styles.meta, color: isMine ? wa.metaOutgoing : wa.meta }}>
                  <span>{formatMessageTime(msg.created_at)}</span>
                  {isMine && (
                    <span style={{ display: 'inline-flex', marginLeft: 2, color: msg.read_at ? wa.tick : wa.tickSent }}>
                      {msg.read_at ? <CheckCheck size={14} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} />}
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
          <div style={styles.typingRow}>
            <div style={styles.typingBubble}>
              <span style={styles.typingDot} />
              <span style={{ ...styles.typingDot, animationDelay: '0.15s' }} />
              <span style={{ ...styles.typingDot, animationDelay: '0.3s' }} />
            </div>
            <span style={styles.typingLabel}>{peerLabel} is typing</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className={motionClass.shake} style={styles.error}>{error}</div>}

      {imagePreview && (
        <div className={motionClass.inputBarEnter} style={styles.imagePreviewBar}>
          <img src={imagePreview.url} alt="Preview" style={styles.previewThumb} />
          <button
            type="button"
            onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null) }}
            style={styles.previewCancel}
          >
            Cancel
          </button>
          <button type="button" onClick={() => void uploadAndSendImage()} disabled={sending} style={styles.previewSend}>
            Send
          </button>
        </div>
      )}

      <div className={`coach-chat-input-bar ${motionClass.inputBarEnter}`} style={styles.inputBar}>
        <div style={styles.composer}>
          <span style={styles.composerIcon} aria-hidden>
            <Smile size={22} color={wa.textMuted} />
          </span>
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); handleTyping() }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (imagePreview) void uploadAndSendImage()
                else void sendMessage()
              }
            }}
            placeholder="Message"
            className="coach-chat-input"
            style={styles.input}
            disabled={sending}
          />
          <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} id={`chat-image-${conversationId}`} />
          <label htmlFor={`chat-image-${conversationId}`} style={styles.attachBtn} aria-label="Attach image">
            <ImageIcon size={22} color={wa.textMuted} />
          </label>
        </div>

        {showSend ? (
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !input.trim()}
            className="btn-press"
            style={styles.sendBtn}
            aria-label="Send"
          >
            <Send size={18} fill="currentColor" />
          </button>
        ) : (
          <div style={styles.micWrap}>
            <VoiceRecorder
              conversationId={conversationId}
              onSent={() => void fetchMessages()}
              onError={setError}
            />
          </div>
        )}
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
    backgroundColor: wa.bg,
    position: 'relative',
  },
  contextBar: {
    minHeight: 42,
    padding: '6px 10px',
    backgroundColor: wa.header,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    fontSize: 12,
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  bookCallBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 999,
    background: wa.input,
    color: wa.text,
    padding: '7px 11px',
    fontSize: 12,
    cursor: 'pointer',
  },
  responseTarget: {
    padding: '7px 12px',
    backgroundColor: wa.systemBg,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: 11.5,
    lineHeight: 1.4,
    flexShrink: 0,
  },
  callRequestPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 10px',
    backgroundColor: wa.systemBg,
    color: wa.text,
    fontSize: 12,
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  scheduleInput: {
    minHeight: 34,
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 7,
    background: wa.input,
    color: wa.text,
    padding: '4px 7px',
  },
  callAction: {
    minHeight: 34,
    border: 'none',
    borderRadius: 7,
    background: wa.send,
    color: '#fff',
    padding: '5px 9px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  thread: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 6px 10px',
    scrollBehavior: 'smooth',
    position: 'relative',
    zIndex: 1,
  },
  wallpaper: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    opacity: 0.06,
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\' viewBox=\'0 0 120 120\'%3E%3Cg fill=\'%23fff\' fill-opacity=\'0.9\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1.5\'/%3E%3Ccircle cx=\'60\' cy=\'30\' r=\'1\'/%3E%3Ccircle cx=\'100\' cy=\'70\' r=\'1.2\'/%3E%3Ccircle cx=\'30\' cy=\'90\' r=\'1\'/%3E%3Ccircle cx=\'80\' cy=\'100\' r=\'1.4\'/%3E%3C/g%3E%3C/svg%3E")',
    backgroundColor: wa.pattern,
  },
  skeletonWrap: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px', position: 'relative', zIndex: 1 },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 24,
    position: 'relative',
    zIndex: 1,
  },
  emptyCard: {
    maxWidth: 320,
    backgroundColor: wa.systemBg,
    color: wa.systemText,
    fontSize: 13,
    lineHeight: 1.5,
    padding: '10px 14px',
    borderRadius: 8,
    boxShadow: '0 1px 1px rgba(0,0,0,0.2)',
  },
  systemMsg: {
    textAlign: 'center',
    color: wa.systemText,
    fontSize: 12.5,
    padding: '6px 12px',
    backgroundColor: wa.systemBg,
    borderRadius: 8,
    alignSelf: 'center',
    margin: '6px 0',
    maxWidth: '85%',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.15)',
    zIndex: 1,
  },
  checkinSystemMsg: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 340,
    backgroundColor: wa.systemBg,
    borderRadius: 8,
    padding: '12px 14px',
    margin: '6px 0',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.15)',
    zIndex: 1,
  },
  checkinContent: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: 13.5,
    lineHeight: 1.5,
    color: wa.text,
    whiteSpace: 'pre-wrap',
    textAlign: 'left',
  },
  bubbleMine: {
    backgroundColor: wa.outgoing,
    color: wa.text,
    borderRadius: '8px 8px 0 8px',
    padding: '6px 8px 4px 9px',
    maxWidth: '78%',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.18)',
    position: 'relative',
  },
  bubbleOther: {
    backgroundColor: wa.incoming,
    color: wa.text,
    borderRadius: '8px 8px 8px 0',
    padding: '6px 8px 4px 9px',
    maxWidth: '78%',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.18)',
    position: 'relative',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 1,
    paddingLeft: 8,
  },
  image: { maxWidth: '100%', borderRadius: 6, maxHeight: 280, display: 'block' },
  typingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
    zIndex: 1,
  },
  typingBubble: {
    display: 'flex',
    gap: 3,
    alignItems: 'center',
    backgroundColor: wa.incoming,
    borderRadius: 16,
    padding: '10px 12px',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.18)',
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: wa.textMuted,
    display: 'inline-block',
    animation: 'wa-typing 1.2s infinite ease-in-out',
  },
  typingLabel: { color: wa.textMuted, fontSize: 12 },
  error: {
    backgroundColor: wa.dangerBg,
    color: wa.danger,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    margin: '0 12px 8px',
    flexShrink: 0,
    zIndex: 2,
  },
  inputBar: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    flexShrink: 0,
    padding: '6px 8px calc(8px + env(safe-area-inset-bottom, 0px))',
    backgroundColor: wa.inputBar,
    zIndex: 2,
  },
  composer: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    backgroundColor: wa.input,
    borderRadius: 24,
    minHeight: 44,
    padding: '4px 6px 4px 10px',
  },
  composerIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    padding: '8px 4px',
    border: 'none',
    borderRadius: 0,
    fontSize: 16,
    outline: 'none',
    backgroundColor: 'transparent',
    color: wa.text,
  },
  sendBtn: {
    minHeight: 44,
    minWidth: 44,
    padding: 0,
    backgroundColor: wa.send,
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
  },
  micWrap: {
    minHeight: 44,
    minWidth: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  attachBtn: {
    minHeight: 36,
    minWidth: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  imagePreviewBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    backgroundColor: wa.header,
    flexShrink: 0,
    zIndex: 2,
  },
  previewThumb: { width: 56, height: 56, borderRadius: 8, objectFit: 'cover' },
  previewCancel: {
    padding: '8px 12px',
    border: 'none',
    borderRadius: 20,
    background: wa.input,
    color: wa.text,
    cursor: 'pointer',
    fontSize: 13,
  },
  previewSend: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 20,
    backgroundColor: wa.send,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    marginLeft: 'auto',
  },
}
