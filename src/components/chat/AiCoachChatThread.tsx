'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Send } from 'lucide-react'
import { StorageImage } from '@/components/ui/StorageImage'
import { VoicePlayer } from '@/components/chat/VoicePlayer'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'
import {
  COACH_REPLY_QUIET_MS,
  decodeChatPhoto,
  decodeChatVoice,
  encodeChatPhoto,
  encodeChatVoice,
} from '@/lib/chat-reply-pause'
import { clientColors as colors, radius, spacing } from '@/lib/design-tokens'
import { CHAT_LANGUAGES, parseChatLanguage, type ChatLanguage } from '@/lib/ai/coach-chat-language'

type Msg = { id?: string; role: 'user' | 'assistant'; content: string; created_at?: string }

export function AiCoachChatThread() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null)
  const [language, setLanguage] = useState<ChatLanguage>('hinglish')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const pauseRef = useRef<number | null>(null)
  const sendingRef = useRef(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/client/ai-chat', { credentials: 'include', cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          if (!active) return
          setError(data?.error ?? 'Could not load chat')
          setLoading(false)
          return
        }
        if (!active) return
        setMessages((data?.messages as Msg[]) ?? [])
        setLanguage(parseChatLanguage(data?.replyLanguage) ?? 'hinglish')
        setLoading(false)
      } catch {
        if (!active) return
        setError('Could not load chat')
        setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending, waiting])

  useEffect(() => {
    return () => {
      if (pauseRef.current) window.clearTimeout(pauseRef.current)
    }
  }, [])

  const requestReply = async () => {
    if (pauseRef.current) {
      window.clearTimeout(pauseRef.current)
      pauseRef.current = null
    }
    setWaiting(false)
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/client/ai-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyNow: true, language }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError('Something went wrong. Try again.')
        setSending(false)
        return
      }
      if (data?.message) {
        setMessages((prev) => [...prev, data.message as Msg])
      }
    } catch {
      setError('Could not reply')
    } finally {
      setSending(false)
    }
  }

  const scheduleReply = () => {
    if (pauseRef.current) window.clearTimeout(pauseRef.current)
    setWaiting(true)
    pauseRef.current = window.setTimeout(() => {
      void requestReply()
    }, COACH_REPLY_QUIET_MS)
  }

  const send = async () => {
    const text = draft.trim()
    if ((!text && !imagePreview) || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError('')
    setDraft('')
    const tempId = `local-${Date.now()}`

    let content = text
    try {
      if (imagePreview) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Sign in again to send a photo.')
          setSending(false)
          return
        }
        const path = `${user.id}/ai-chat/${Date.now()}_${imagePreview.file.name}`
        const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, imagePreview.file)
        if (uploadError) {
          setDraft(text)
          setError('Something went wrong sending that photo. Try again.')
          return
        }
        content = encodeChatPhoto(path, text)
        URL.revokeObjectURL(imagePreview.url)
        setImagePreview(null)
      }

      setMessages((prev) => [...prev, { id: tempId, role: 'user', content }])
      const res = await fetch('/api/client/ai-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, language }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setMessages((prev) => prev.filter((item) => item.id !== tempId))
        setDraft(text)
        setError('Something went wrong sending that message. Try again.')
        return
      }
      if (data?.message) {
        setWaiting(false)
        setMessages((prev) => [...prev.filter((item) => item.id !== tempId), data.message as Msg])
      } else if (data?.pending) {
        scheduleReply()
      }
    } catch {
      setMessages((prev) => prev.filter((item) => item.id !== tempId))
      setDraft(text)
      setError('Something went wrong sending that message. Try again.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const sendVoiceNote = async (note: { blob: Blob; extension: string; contentType: string }) => {
    if (note.blob.size > 8_000_000) {
      setError('That voice note is too long. Try a shorter one, or type it.')
      return
    }
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError('')
    const tempId = `local-${Date.now()}`
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Sign in again to send a voice note.')
        return
      }
      const path = `${user.id}/ai-chat/${Date.now()}.${note.extension}`
      const { error: uploadError } = await supabase.storage.from('chat-voice').upload(path, note.blob, {
        contentType: note.contentType,
        upsert: false,
      })
      if (uploadError) {
        setError('Something went wrong sending that voice note. Try again.')
        return
      }
      const content = encodeChatVoice(path, '')
      setMessages((prev) => [...prev, { id: tempId, role: 'user', content }])
      const res = await fetch('/api/client/ai-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, language }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setMessages((prev) => prev.filter((item) => item.id !== tempId))
        setError('Something went wrong sending that voice note. Try again.')
        return
      }
      if (data?.message) {
        setWaiting(false)
        setMessages((prev) => [...prev.filter((item) => item.id !== tempId), data.message as Msg])
      } else if (data?.pending) {
        scheduleReply()
      }
    } catch {
      setMessages((prev) => prev.filter((item) => item.id !== tempId))
      setError('Something went wrong sending that voice note. Try again.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          padding: `${spacing[3]}px ${spacing[4]}px`,
          borderBottom: `1px solid ${colors.divider}`,
          background: colors.bgGlass,
        }}
      >
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>Smart Coach</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>
          Ask about your plan. A voice note works too.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }} role="group" aria-label="Chat language">
          {CHAT_LANGUAGES.map((option) => {
            const selected = language === option.id
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setLanguage(option.id)
                  void fetch('/api/client/ai-chat', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ language: option.id }),
                  })
                }}
                style={{
                  minHeight: 32,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: `1px solid ${selected ? colors.accent : colors.borderSubtle}`,
                  background: selected ? colors.accent : colors.bgCard,
                  color: selected ? colors.textInverse : colors.textPrimary,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: spacing[4], display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>Loading coach chat…</p>
        )}
        {!loading && messages.length === 0 && (
          <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
            Start a conversation with Smart Coach. Hinglish is the usual choice, and it uses English letters. Pick Hindi letters only if you want Hindi script.
          </p>
        )}
        {messages.map((msg, index) => {
          const mine = msg.role === 'user'
          const voice = decodeChatVoice(msg.content)
          const photo = voice.audioPath ? { imagePath: null, text: voice.text } : decodeChatPhoto(msg.content)
          return (
            <div
              key={msg.id ?? `${msg.role}-${index}`}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                padding: '10px 12px',
                borderRadius: radius.md,
                background: mine ? '#0f766e' : colors.bgElevated,
                color: mine ? '#ecfdf5' : colors.textPrimary,
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
              }}
            >
              {voice.audioPath ? (
                <VoicePlayer url={voice.audioPath} duration={undefined} lightBubble={!mine} />
              ) : null}
              {photo.imagePath ? (
                <StorageImage
                  bucket="chat-images"
                  src={photo.imagePath}
                  alt="Photo you sent"
                  style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, marginBottom: photo.text ? 8 : 0 }}
                />
              ) : null}
              {photo.text}
            </div>
          )
        })}
        {sending && !waiting && (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>Sending…</p>
        )}
        <div ref={bottomRef} />
      </div>
      {error && (
        <p style={{ margin: `0 ${spacing[4]}px ${spacing[2]}px`, color: colors.danger, fontSize: 13 }}>
          {error}
        </p>
      )}
      {waiting && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            margin: `0 ${spacing[3]}px ${spacing[2]}px`,
            padding: '10px 12px',
            borderRadius: radius.sm,
            background: colors.accentMuted,
            border: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: colors.textSecondary }}>
            Send another message if you are still explaining. A reply starts when you pause.
          </p>
          <button
            type="button"
            onClick={() => void requestReply()}
            style={{
              flexShrink: 0,
              minHeight: 40,
              padding: '0 12px',
              border: 'none',
              borderRadius: radius.sm,
              background: colors.accent,
              color: colors.textInverse,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Reply now
          </button>
        </div>
      )}
      {imagePreview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `0 ${spacing[3]}px ${spacing[2]}px` }}>
          <img src={imagePreview.url} alt="Photo to send" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(imagePreview.url)
              setImagePreview(null)
            }}
            style={{
              minHeight: 36,
              padding: '0 12px',
              border: 'none',
              borderRadius: 999,
              background: colors.bgElevated,
              color: colors.textPrimary,
              cursor: 'pointer',
            }}
          >
            Remove photo
          </button>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          padding: spacing[3],
          paddingBottom: `calc(${spacing[3]}px + env(safe-area-inset-bottom, 0px))`,
          borderTop: `1px solid ${colors.divider}`,
          background: colors.bgGlass,
        }}
      >
        <VoiceRecorder onRecorded={sendVoiceNote} onError={(msg) => setError(msg)} />
        <label
          style={{
            flexShrink: 0,
            minHeight: 44,
            padding: '0 12px',
            borderRadius: radius.sm,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgCard,
            color: colors.textPrimary,
            fontWeight: 800,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <ImageIcon size={16} />
          Photo
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              if (imagePreview) URL.revokeObjectURL(imagePreview.url)
              setImagePreview({ file, url: URL.createObjectURL(file) })
              event.target.value = ''
            }}
          />
        </label>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Message Smart Coach…"
          aria-label="Message"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            borderRadius: radius.sm,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgCard,
            color: colors.textPrimary,
            padding: '0 12px',
            fontSize: 16,
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || (!draft.trim() && !imagePreview)}
          aria-label="Send"
          style={{
            flexShrink: 0,
            minHeight: 44,
            minWidth: 72,
            padding: '0 14px',
            borderRadius: radius.sm,
            border: 'none',
            background: colors.accent,
            color: colors.textInverse,
            fontWeight: 800,
            cursor: sending ? 'wait' : 'pointer',
            opacity: sending || (!draft.trim() && !imagePreview) ? 0.55 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Send size={16} />
          Send
        </button>
      </div>
    </div>
  )
}
