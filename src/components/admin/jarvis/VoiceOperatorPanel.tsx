'use client'

/**
 * Phase 11 — Push-to-talk voice operator controls.
 * Hold to talk → server STT → existing chat/orchestrator path via realtime API.
 * Interrupt stops TTS only — never cancels business actions.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import type { JarvisRealtimeState, RealtimeProviderStatus } from '@/lib/jarvis/realtime/types'

type Capability = {
  enabled: boolean
  provider: string
  model: string | null
  status: RealtimeProviderStatus
  note: string
  modalities: {
    text: string
    voice_input: RealtimeProviderStatus
    voice_output: RealtimeProviderStatus
    realtime: RealtimeProviderStatus
  }
}

type VoiceOperatorProps = {
  conversationId: string | null
  /** Called after server already ran the orchestrator — do not re-send to /chat. */
  onVoiceResult: (result: {
    transcript: string
    assistantText: string
    conversationId: string | null
    approvals: Array<{ id: string; summary: string; risk: string }>
  }) => void
  busy?: boolean
  compact?: boolean
  /** Listening / speaking / idle — command home uses this for the status word. */
  onPresence?: (phase: 'listening' | 'speaking' | 'idle') => void
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return 'audio/webm'
}

function statusLabel(status?: RealtimeProviderStatus | string) {
  if (!status) return 'UNKNOWN'
  if (status === 'CONNECTED') return 'CONNECTED'
  if (status === 'DISABLED') return 'DISABLED'
  if (status === 'NOT_CONFIGURED') return 'NOT CONFIGURED'
  if (status === 'DEGRADED') return 'DEGRADED'
  return status
}

function orbColor(state: JarvisRealtimeState): string {
  switch (state) {
    case 'LISTENING':
      return colors.accent
    case 'TRANSCRIBING':
    case 'THINKING':
    case 'TOOL_CALLING':
      return colors.warning
    case 'WAITING_APPROVAL':
      return colors.warning
    case 'SPEAKING':
      return colors.success
    case 'ERROR':
      return colors.danger
    default:
      return colors.borderSubtle
  }
}

export function VoiceOperatorPanel({
  conversationId,
  onVoiceResult,
  busy,
  compact,
  onPresence,
}: VoiceOperatorProps) {
  const [capability, setCapability] = useState<Capability | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [state, setState] = useState<JarvisRealtimeState>('IDLE')
  const [error, setError] = useState('')
  const [speakEnabled, setSpeakEnabled] = useState(true)
  const [listening, setListening] = useState(false)
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    if (!onPresence) return
    if (listening || state === 'LISTENING') onPresence('listening')
    else if (state === 'SPEAKING') onPresence('speaking')
    else onPresence('idle')
  }, [listening, state, onPresence])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/admin/jarvis/realtime')
        const json = await res.json()
        if (!cancelled && json.realtime) setCapability(json.realtime)
      } catch {
        if (!cancelled) {
          setCapability({
            enabled: false,
            provider: 'unknown',
            model: null,
            status: 'UNKNOWN',
            note: 'Could not load realtime status.',
            modalities: {
              text: 'AVAILABLE',
              voice_input: 'UNKNOWN',
              voice_output: 'UNKNOWN',
              realtime: 'UNKNOWN',
            },
          })
        }
      }
    })()
    return () => {
      cancelled = true
      stopTracks()
      stopSpeech()
      const sid = sessionIdRef.current
      if (sid) {
        void fetch('/api/admin/jarvis/realtime', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'close', sessionId: sid, reason: 'unmount' }),
        }).catch(() => undefined)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      try {
        mediaRef.current.stop()
      } catch {
        /* ignore */
      }
    }
    mediaRef.current = null
  }

  function stopSpeech() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
  }

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current
    const res = await fetch('/api/admin/jarvis/realtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', conversationId }),
    })
    const json = await res.json()
    if (!json.success || !json.session?.id) {
      setError(json.error || 'Voice session could not start.')
      setCapability(json.realtime ?? capability)
      return null
    }
    setSessionId(json.session.id)
    sessionIdRef.current = json.session.id
    if (json.realtime) setCapability(json.realtime)
    return json.session.id as string
  }, [capability, conversationId])

  async function playSpeech(speech: {
    audio_base64: string | null
    content_type: string
    interrupted: boolean
  } | null) {
    if (!speech?.audio_base64 || speech.interrupted || !speakEnabled) return
    stopSpeech()
    try {
      const bytes = Uint8Array.from(atob(speech.audio_base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: speech.content_type || 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      setState('SPEAKING')
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setState('IDLE')
      }
      await audio.play()
    } catch {
      setError('Tap to enable voice responses (browser blocked autoplay).')
      setState('IDLE')
    }
  }

  async function handleInterrupt() {
    stopSpeech()
    setState('IDLE')
    const sid = sessionIdRef.current
    if (!sid) return
    await fetch('/api/admin/jarvis/realtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'interrupt', sessionId: sid }),
    }).catch(() => undefined)
  }

  useEffect(() => {
    const onInterrupt = () => {
      void handleInterrupt()
    }
    window.addEventListener('jarvis:interrupt-speech', onInterrupt)
    return () => window.removeEventListener('jarvis:interrupt-speech', onInterrupt)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once for Escape speech stop
  }, [])

  async function startListening() {
    setError('')
    if (busy) return
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('Voice requires HTTPS.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("Voice isn't supported in this browser. You can still use text Jarvis.")
      return
    }
    if (capability && capability.modalities.voice_input !== 'CONNECTED') {
      setError(capability.note || 'Voice is not configured.')
      return
    }
    stopSpeech()
    const sid = await ensureSession()
    if (!sid) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        void submitAudio(sid, new Blob(chunksRef.current, { type: mime || 'audio/webm' }))
      }
      mediaRef.current = recorder
      recorder.start()
      setListening(true)
      setState('LISTENING')
    } catch (err) {
      stopTracks()
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setError('Microphone access denied. Allow permission, then hold to talk again.')
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No microphone found on this device.')
      } else {
        setError('Could not start microphone.')
      }
      setState('ERROR')
    }
  }

  function stopListening() {
    setListening(false)
    if (mediaRef.current && mediaRef.current.state === 'recording') {
      mediaRef.current.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function submitAudio(sid: string, blob: Blob) {
    setState('TRANSCRIBING')
    try {
      const form = new FormData()
      form.set('action', 'audio')
      form.set('sessionId', sid)
      form.set('speak', speakEnabled ? 'true' : 'false')
      form.set('audio', blob, 'jarvis-ptt.webm')
      const res = await fetch('/api/admin/jarvis/realtime', { method: 'POST', body: form })
      const json = await res.json()
      let transcript = ''
      for (const ev of json.events ?? []) {
        if (ev.type === 'user.transcript' && ev.text) transcript = ev.text
        if (ev.type === 'state.changed' && ev.state) setState(ev.state)
        if (ev.type === 'cost.updated') setEstimatedCost(ev.estimated_cost_usd ?? null)
        if (ev.type === 'error') setError(ev.message || 'Voice error')
      }
      if (transcript || json.assistantText) {
        onVoiceResult({
          transcript,
          assistantText: json.assistantText || '',
          conversationId: json.conversationId ?? null,
          approvals: json.approvals ?? [],
        })
      }
      if (json.speech) await playSpeech(json.speech)
      else if (!json.events?.some((e: { type: string }) => e.type === 'error')) setState('IDLE')
    } catch {
      setError('Voice request failed. Text Jarvis is still available.')
      setState('ERROR')
    } finally {
      stopTracks()
    }
  }

  const voiceReady = capability?.modalities.voice_input === 'CONNECTED'
  const voiceLabel = statusLabel(capability?.modalities.voice_input || capability?.status)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: compact ? 'stretch' : 'center',
        gap: 10,
        padding: compact ? '8px 0 0' : '12px 0 4px',
      }}
    >
      {!compact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${orbColor(state)}, transparent 70%)`,
              border: `1px solid ${orbColor(state)}`,
              boxShadow: state === 'LISTENING' || state === 'SPEAKING' ? `0 0 18px ${orbColor(state)}55` : 'none',
              transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
            }}
          />
          <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>
            <div style={{ color: colors.textSecondary, fontWeight: 650 }}>What should I handle?</div>
            <div title={capability?.note || undefined}>
              ● Voice{' '}
              {voiceLabel === 'CONNECTED'
                ? 'ready'
                : voiceLabel === 'DISABLED'
                  ? 'off'
                  : 'unavailable'}
              {capability?.provider ? ` · ${capability.provider}` : ''}
            </div>
            {estimatedCost != null ? (
              <div>Session est. ${estimatedCost.toFixed(3)}</div>
            ) : null}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: compact ? 'flex-start' : 'center' }}>
        <button
          type="button"
          disabled={busy || (!voiceReady && capability != null)}
          aria-label={listening ? 'Jarvis is listening. Release to send.' : 'Hold to talk to Jarvis'}
          aria-pressed={listening}
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId)
            void startListening()
          }}
          onPointerUp={() => stopListening()}
          onPointerCancel={() => stopListening()}
          onLostPointerCapture={() => {
            if (listening) stopListening()
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 999,
            border: `1px solid ${listening ? colors.accent : colors.borderSubtle}`,
            background: listening ? `${colors.accent}22` : colors.bgElevated,
            color: colors.textPrimary,
            fontSize: 13,
            fontWeight: 650,
            cursor: voiceReady ? 'pointer' : 'not-allowed',
            opacity: voiceReady || capability == null ? 1 : 0.55,
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          <Mic size={14} />
          {listening ? 'Listening…' : 'Hold to Talk'}
        </button>

        {state === 'SPEAKING' && (
          <button
            type="button"
            onClick={() => void handleInterrupt()}
            aria-label="Stop Jarvis speaking"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${colors.borderSubtle}`,
              background: 'transparent',
              color: colors.textSecondary,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <Square size={12} /> Stop
          </button>
        )}

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: colors.textMuted,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={speakEnabled}
            onChange={(e) => setSpeakEnabled(e.target.checked)}
          />
          Speak replies
        </label>
      </div>

      <div
        role="status"
        aria-live="polite"
        style={{ fontSize: 11, color: error ? colors.danger : colors.textMuted, textAlign: compact ? 'left' : 'center' }}
      >
        {error
          ? error
          : state === 'IDLE'
            ? voiceReady
              ? 'Push-to-talk ready. Text Jarvis always works.'
              : capability?.note || 'Voice status loading…'
            : `Jarvis is ${state.toLowerCase().replace(/_/g, ' ')}.`}
      </div>
    </div>
  )
}

export function VoiceStatusChip({ status }: { status?: RealtimeProviderStatus | string }) {
  const label = statusLabel(status)
  const muted = label === 'DISABLED' || label === 'NOT CONFIGURED' || label === 'UNKNOWN'
  return (
    <span
      title={
        label === 'DISABLED'
          ? 'JARVIS_REALTIME_ENABLED is not true. Text Jarvis remains available.'
          : label === 'NOT CONFIGURED'
            ? 'Voice credentials missing. Text Jarvis remains available.'
            : undefined
      }
      style={{ fontSize: 11, color: muted ? colors.textMuted : colors.success, cursor: muted ? 'help' : 'default' }}
    >
      ● Voice {label === 'CONNECTED' ? 'ready' : label === 'DISABLED' ? 'off' : 'unavailable'}
    </span>
  )
}
