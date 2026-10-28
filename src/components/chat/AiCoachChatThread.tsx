'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ImageIcon, Paperclip, Send, Settings } from 'lucide-react'
import { StorageImage } from '@/components/ui/StorageImage'
import { VoicePlayer } from '@/components/chat/VoicePlayer'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'
import {
  AI_COACH_REPLY_BATCH_MS,
  chatTextForModel,
  coachTypingDurationMs,
  decodeChatPhoto,
  decodeChatVoice,
  encodeChatPhoto,
  encodeChatVoice,
} from '@/lib/chat-reply-pause'
import {
  aiCoachFileStoragePath,
  CHAT_FILE_BUCKET,
  CHAT_FILE_MAX_BYTES,
  decodeChatFile,
  encodeChatFile,
  isImageFile,
  isVideoFile,
  safeChatFileName,
} from '@/lib/chat-file'
import { clientColors as colors, radius, spacing } from '@/lib/design-tokens'
import { markSmartCoachRead } from '@/lib/smart-coach-unread'
import { aiCoachImageStoragePath } from '@/lib/ai/ai-coach-photo-path'
import { CHAT_LANGUAGES, parseChatLanguage, type ChatLanguage } from '@/lib/ai/coach-chat-language'
import { CHAT_MOODS, parseChatMood, type ChatMood } from '@/lib/ai/coach-chat-mood'
import { convertHeicFileToJpeg, isHeicLike } from '@/lib/photo'

type Msg = { id?: string; role: 'user' | 'assistant'; content: string; created_at?: string }

function typingDotStyle(delaySeconds: number): CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#aebac1',
    display: 'inline-block',
    animation: 'wa-typing 1.2s infinite ease-in-out',
    animationDelay: `${delaySeconds}s`,
  }
}

export function AiCoachChatThread() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [coachTyping, setCoachTyping] = useState(false)
  const [error, setError] = useState('')
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null)
  const [filePreview, setFilePreview] = useState<File | null>(null)
  const [language, setLanguage] = useState<ChatLanguage>('hinglish')
  const [mood, setMood] = useState<ChatMood>('auto')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const stickToLatestRef = useRef(true)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const pauseRef = useRef<number | null>(null)
  const sendingRef = useRef(false)
  const replyEpoch = useRef(0)
  const typingSince = useRef<number | null>(null)

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
        setMood(parseChatMood(data?.replyMood) ?? 'auto')
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

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || loading || !stickToLatestRef.current) return
    const pin = () => {
      const el = listRef.current
      if (!el || !stickToLatestRef.current) return
      el.scrollTop = el.scrollHeight
    }
    pin()
    const frame = window.requestAnimationFrame(pin)
    const observer = new ResizeObserver(pin)
    for (const child of Array.from(list.children)) observer.observe(child)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [loading, messages, sending, coachTyping, imagePreview])

  useEffect(() => {
    if (loading) return
    const latest = messages.reduce<string | null>((newest, message) => {
      if (!message.created_at) return newest
      if (!newest || message.created_at > newest) return message.created_at
      return newest
    }, null)
    markSmartCoachRead(latest ?? new Date().toISOString())
  }, [loading, messages])

  useEffect(() => {
    return () => {
      if (pauseRef.current) window.clearTimeout(pauseRef.current)
    }
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const close = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen])

  const saveSettings = (next: { language?: ChatLanguage; mood?: ChatMood }) => {
    if (next.language) setLanguage(next.language)
    if (next.mood) setMood(next.mood)
    void fetch('/api/client/ai-chat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
  }

  const revealCoachMessage = async (epoch: number, message: Msg) => {
    const needed = coachTypingDurationMs(chatTextForModel(message.content))
    const started = typingSince.current ?? Date.now()
    const remain = Math.max(0, needed - (Date.now() - started))
    if (remain > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remain))
    }
    setMessages((prev) => (prev.some((item) => item.id && item.id === message.id) ? prev : [...prev, message]))
    if (epoch !== replyEpoch.current) return
    typingSince.current = null
    setCoachTyping(false)
  }

  const requestReply = async (epoch: number) => {
    if (pauseRef.current) {
      window.clearTimeout(pauseRef.current)
      pauseRef.current = null
    }
    setError('')
    try {
      const res = await fetch('/api/client/ai-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyNow: true, language, mood }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        if (epoch !== replyEpoch.current) return
        setCoachTyping(false)
        typingSince.current = null
        setError('Something went wrong. Try again.')
        return
      }
      if (data?.message) {
        await revealCoachMessage(epoch, data.message as Msg)
      } else if (epoch === replyEpoch.current) {
        typingSince.current = null
        setCoachTyping(false)
      }
    } catch {
      if (epoch !== replyEpoch.current) return
      typingSince.current = null
      setCoachTyping(false)
      setError('Could not reply')
    }
  }

  const scheduleReply = () => {
    if (pauseRef.current) window.clearTimeout(pauseRef.current)
    if (!typingSince.current) typingSince.current = Date.now()
    setCoachTyping(true)
    const epoch = ++replyEpoch.current
    pauseRef.current = window.setTimeout(() => {
      void requestReply(epoch)
    }, AI_COACH_REPLY_BATCH_MS)
  }

  const send = async () => {
    const text = draft.trim()
    if ((!text && !imagePreview && !filePreview) || sendingRef.current) return
    stickToLatestRef.current = true
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
        let photoFile = imagePreview.file
        if (photoFile.size > 12_000_000) {
          setDraft(text)
          setError('That photo is too large. Choose a smaller one.')
          return
        }
        if (isHeicLike(photoFile)) {
          try {
            photoFile = await convertHeicFileToJpeg(photoFile)
          } catch {
            setDraft(text)
            setError('That iPhone photo could not be prepared. Choose a JPEG or PNG.')
            return
          }
        }
        const path = aiCoachImageStoragePath(user.id, photoFile.name)
        const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, photoFile, {
          contentType: photoFile.type || 'image/jpeg',
          upsert: false,
        })
        if (uploadError) {
          setDraft(text)
          setError('Something went wrong sending that photo. Try again.')
          return
        }
        content = encodeChatPhoto(path, text)
        URL.revokeObjectURL(imagePreview.url)
        setImagePreview(null)
      } else if (filePreview) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Sign in again to send that file.')
          setSending(false)
          return
        }
        if (isVideoFile(filePreview.name, filePreview.type)) {
          setDraft(text)
          setError('Videos are not accepted. Send a document, spreadsheet, photo, or text file.')
          return
        }
        if (filePreview.size > CHAT_FILE_MAX_BYTES) {
          setDraft(text)
          setError('That file is too large. Keep it under 15 MB.')
          return
        }
        const path = aiCoachFileStoragePath(user.id, filePreview.name)
        const { error: uploadError } = await supabase.storage.from(CHAT_FILE_BUCKET).upload(path, filePreview, {
          contentType: filePreview.type || 'application/octet-stream',
          upsert: false,
        })
        if (uploadError) {
          setDraft(text)
          setError('Something went wrong sending that file. Try again.')
          return
        }
        content = encodeChatFile(path, safeChatFileName(filePreview.name), text)
        setFilePreview(null)
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
        if (!typingSince.current) typingSince.current = Date.now()
        setCoachTyping(true)
        const epoch = ++replyEpoch.current
        await revealCoachMessage(epoch, data.message as Msg)
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
    stickToLatestRef.current = true
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
        if (!typingSince.current) typingSince.current = Date.now()
        setCoachTyping(true)
        const epoch = ++replyEpoch.current
        await revealCoachMessage(epoch, data.message as Msg)
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
    <div className="client-chat-thread" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        ref={settingsRef}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: `${spacing[3]}px ${spacing[4]}px`,
          borderBottom: `1px solid ${colors.divider}`,
          background: colors.bgGlass,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>Smart Coach</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>
            A photo, a file, or a voice note works. No videos.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={settingsOpen}
          aria-controls="coach-chat-settings"
          onClick={() => setSettingsOpen((open) => !open)}
          style={{
            flexShrink: 0,
            minHeight: 36,
            padding: '0 12px',
            borderRadius: 999,
            border: `1px solid ${settingsOpen ? colors.accent : colors.borderSubtle}`,
            background: settingsOpen ? colors.accent : colors.bgCard,
            color: settingsOpen ? colors.textInverse : colors.textPrimary,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Settings size={15} />
          Settings
        </button>
        {settingsOpen && (
          <div
            id="coach-chat-settings"
            role="dialog"
            aria-label="Coach chat settings"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: spacing[4],
              left: spacing[4],
              zIndex: 6,
              padding: 12,
              borderRadius: radius.md,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgCard,
              boxShadow: '0 16px 40px rgba(28, 25, 21, 0.16)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: colors.textMuted }}>Language</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Chat language">
                {CHAT_LANGUAGES.map((option) => {
                  const selected = language === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => saveSettings({ language: option.id })}
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
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: colors.textMuted }}>Mood</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Coach mood">
                {CHAT_MOODS.map((option) => {
                  const selected = mood === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => saveSettings({ mood: option.id })}
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
          </div>
        )}
      </div>
      <div
        ref={listRef}
        className="client-chat-messages"
        onScroll={(event) => {
          const el = event.currentTarget
          stickToLatestRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: spacing[4], display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {loading && (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>Loading coach chat…</p>
        )}
        {!loading && messages.length === 0 && (
          <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
            Start a conversation with Smart Coach. Open Settings if you want a different language or mood.
          </p>
        )}
        {messages.map((msg, index) => {
          const mine = msg.role === 'user'
          const voice = decodeChatVoice(msg.content)
          const attached = voice.audioPath
            ? { path: null as string | null, name: '', text: voice.text, extract: '' }
            : decodeChatFile(msg.content)
          const photo =
            voice.audioPath || attached.path
              ? { imagePath: null, text: attached.text }
              : decodeChatPhoto(msg.content)
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
              {attached.path ? (
                <p style={{ margin: photo.text ? '0 0 6px' : 0, fontWeight: 700 }}>{attached.name}</p>
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
        {coachTyping && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }} aria-live="polite">
            <div
              style={{
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                background: colors.bgElevated,
                borderRadius: 16,
                padding: '10px 12px',
              }}
            >
              <span style={typingDotStyle(0)} />
              <span style={typingDotStyle(0.15)} />
              <span style={typingDotStyle(0.3)} />
            </div>
            <span style={{ color: colors.textMuted, fontSize: 12 }}>Coach is typing</span>
          </div>
        )}
      </div>
      {error && (
        <p style={{ margin: `0 ${spacing[4]}px ${spacing[2]}px`, color: colors.danger, fontSize: 13 }}>
          {error}
        </p>
      )}
      {filePreview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `0 ${spacing[3]}px ${spacing[2]}px` }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>{safeChatFileName(filePreview.name)}</p>
          <button
            type="button"
            onClick={() => setFilePreview(null)}
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
            Remove file
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
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: spacing[3],
          paddingBottom: `calc(${spacing[3]}px + env(safe-area-inset-bottom, 0px))`,
          borderTop: `1px solid ${colors.divider}`,
          background: colors.bgGlass,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label
            style={{
              flexShrink: 0,
              minHeight: 44,
              padding: '0 14px',
              borderRadius: radius.sm,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgCard,
              color: colors.textPrimary,
              fontWeight: 800,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <Paperclip size={16} />
            Document
            <input
              type="file"
              aria-label="Attach a document"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                if (isVideoFile(file.name, file.type)) {
                  setError('Videos are not accepted. Send a document, spreadsheet, photo, or text file.')
                  return
                }
                setError('')
                if (isImageFile(file.name, file.type)) {
                  if (imagePreview) URL.revokeObjectURL(imagePreview.url)
                  setFilePreview(null)
                  setImagePreview({ file, url: URL.createObjectURL(file) })
                  return
                }
                if (imagePreview) {
                  URL.revokeObjectURL(imagePreview.url)
                  setImagePreview(null)
                }
                setFilePreview(file)
              }}
            />
          </label>
          <label
            style={{
              flexShrink: 0,
              minHeight: 44,
              padding: '0 14px',
              borderRadius: radius.sm,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgCard,
              color: colors.textPrimary,
              fontWeight: 800,
              fontSize: 14,
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
              aria-label="Attach a photo"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                if (imagePreview) URL.revokeObjectURL(imagePreview.url)
                setFilePreview(null)
                setImagePreview({ file, url: URL.createObjectURL(file) })
                event.target.value = ''
              }}
            />
          </label>
          <VoiceRecorder onRecorded={sendVoiceNote} onError={(msg) => setError(msg)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
          disabled={sending || (!draft.trim() && !imagePreview && !filePreview)}
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
            opacity: sending || (!draft.trim() && !imagePreview && !filePreview) ? 0.55 : 1,
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
    </div>
  )
}
