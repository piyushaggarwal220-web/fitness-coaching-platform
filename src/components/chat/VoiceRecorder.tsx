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

export function VoiceRecorder({ conversationId, onSent, onError }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState<{ blob: Blob; url: string; duration: number } | null>(null)
  const [sending, setSending] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef(0)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      startTimeRef.current = Date.now()

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000)
        setPreview({ blob, url, duration })
        stream.getTracks().forEach((t) => t.stop())
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      onError('Microphone access denied. Please allow microphone access.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
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

      const path = `${user.id}/${conversationId}/${Date.now()}.webm`
      const { error: uploadError } = await supabase.storage.from('chat-voice').upload(path, preview.blob)
      if (uploadError) throw new Error(uploadError.message)

      const { data: urlData } = supabase.storage.from('chat-voice').getPublicUrl(path)

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          messageType: 'voice',
          mediaUrl: urlData.publicUrl,
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

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])

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
      {recording ? <Square size={18} color={colors.danger} fill={colors.danger} /> : <Mic size={20} color={colors.textSecondary} />}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  micBtn: { minHeight: 48, minWidth: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, border: `1px solid ${colors.borderSubtle}`, borderRadius: '50%', cursor: 'pointer' },
  recording: { backgroundColor: colors.dangerMuted, borderColor: colors.danger },
  preview: { display: 'flex', alignItems: 'center', gap: 4 },
  smallBtn: { background: 'none', border: 'none', cursor: 'pointer', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sendSmall: { padding: '6px 12px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: 16, fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36 },
}
