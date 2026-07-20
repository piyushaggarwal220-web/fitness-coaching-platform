'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2 } from 'lucide-react'
import { readApiJson } from '@/lib/api-response'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/design-tokens'
import { motionClass } from '@/lib/motion'

type VoiceRecorderProps = {
  conversationId: string
  onSent: () => void
  onError: (msg: string) => void
}

type RecordingFormat = {
  mimeType: string
  extension: 'm4a' | 'webm' | 'ogg'
  contentType: string
}

type PreviewState = {
  blob: Blob
  url: string
  duration: number
  extension: RecordingFormat['extension']
  contentType: string
}

const MIME_CANDIDATES: Array<{ mimeType: string; extension: RecordingFormat['extension']; contentType: string }> = [
  { mimeType: 'audio/mp4', extension: 'm4a', contentType: 'audio/mp4' },
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a', contentType: 'audio/mp4' },
  { mimeType: 'audio/aac', extension: 'm4a', contentType: 'audio/aac' },
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm', contentType: 'audio/webm' },
  { mimeType: 'audio/webm', extension: 'webm', contentType: 'audio/webm' },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg', contentType: 'audio/ogg' },
]

function pickRecordingFormat(): RecordingFormat | null {
  if (typeof MediaRecorder === 'undefined') return null

  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate
    }
  }

  // Some browsers record without advertising supported types.
  return { mimeType: '', extension: 'webm', contentType: 'audio/webm' }
}

function formatFromRecorder(recorder: MediaRecorder, fallback: RecordingFormat): RecordingFormat {
  const actual = recorder.mimeType?.trim()
  if (!actual) return fallback

  const lower = actual.toLowerCase()
  if (lower.includes('mp4') || lower.includes('aac') || lower.includes('m4a')) {
    return { mimeType: actual, extension: 'm4a', contentType: actual.split(';')[0] || 'audio/mp4' }
  }
  if (lower.includes('ogg')) {
    return { mimeType: actual, extension: 'ogg', contentType: actual.split(';')[0] || 'audio/ogg' }
  }
  return { mimeType: actual, extension: 'webm', contentType: actual.split(';')[0] || 'audio/webm' }
}

function recordingStartErrorMessage(err: unknown): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Voice notes require a secure connection (HTTPS).'
  }
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'Voice notes are not supported in this browser.'
  }
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Microphone access denied. Please allow microphone access.'
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No microphone found on this device.'
    }
  }
  if (err instanceof Error && err.message) return err.message
  return 'Could not start voice recording.'
}

export function VoiceRecorder({ conversationId, onSent, onError }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [sending, setSending] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef(0)
  const formatRef = useRef<RecordingFormat | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startRecording = async () => {
    try {
      const format = pickRecordingFormat()
      if (!format) {
        onError('Voice notes are not supported in this browser.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = format.mimeType
        ? new MediaRecorder(stream, { mimeType: format.mimeType })
        : new MediaRecorder(stream)

      const resolved = formatFromRecorder(recorder, format)
      formatRef.current = resolved
      chunksRef.current = []
      startTimeRef.current = Date.now()

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setRecording(false)
        onError('Recording failed. Please try again.')
      }

      recorder.onstop = () => {
        const activeFormat = formatRef.current ?? resolved
        const blob = new Blob(chunksRef.current, { type: activeFormat.contentType })
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        if (blob.size === 0) {
          onError('Recording was empty. Hold a bit longer, then stop.')
          return
        }

        const url = URL.createObjectURL(blob)
        const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
        setPreview({
          blob,
          url,
          duration,
          extension: activeFormat.extension,
          contentType: activeFormat.contentType,
        })
      }

      mediaRecorderRef.current = recorder
      // Timeslice helps some mobile browsers flush audio chunks reliably.
      recorder.start(250)
      setRecording(true)
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      onError(recordingStartErrorMessage(err))
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    setRecording(false)
  }

  const deletePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  const sendVoice = async () => {
    if (!preview) return
    setSending(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const path = `${user.id}/${conversationId}/${Date.now()}.${preview.extension}`
      const { error: uploadError } = await supabase.storage
        .from('chat-voice')
        .upload(path, preview.blob, {
          contentType: preview.contentType,
          upsert: false,
        })
      if (uploadError) throw new Error(uploadError.message)

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          messageType: 'voice',
          mediaUrl: path,
          mediaDurationSeconds: preview.duration,
        }),
      })
      const parsed = await readApiJson<{ success?: boolean; error?: string }>(res)
      if (!parsed.ok) throw new Error(parsed.error)

      deletePreview()
      onSent()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to send voice note')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url)
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [preview])

  if (preview) {
    return (
      <div style={styles.preview}>
        <audio src={preview.url} controls style={{ height: 32, maxWidth: 120 }} />
        <button type="button" onClick={deletePreview} style={styles.smallBtn} aria-label="Delete"><Trash2 size={18} color={colors.textMuted} /></button>
        <button type="button" onClick={() => void sendVoice()} disabled={sending} style={styles.sendSmall}>
          {sending ? '...' : 'Send'}
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={recording ? stopRecording : () => void startRecording()}
      className={`btn-press ${recording ? motionClass.recordingPulse : ''}`}
      style={{ ...styles.micBtn, ...(recording ? styles.recording : {}) }}
      aria-label={recording ? 'Stop recording' : 'Record voice message'}
    >
      {recording ? <Square size={18} color="#fff" fill="#fff" /> : <Mic size={22} color="#fff" />}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  micBtn: {
    minHeight: 44,
    minWidth: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00a884',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
  },
  recording: { backgroundColor: '#ea4335' },
  preview: { display: 'flex', alignItems: 'center', gap: 4 },
  smallBtn: { background: 'none', border: 'none', cursor: 'pointer', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sendSmall: { padding: '6px 12px', backgroundColor: '#00a884', color: '#fff', border: 'none', borderRadius: 16, fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36 },
}
