'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Mic, Pause, Play } from 'lucide-react'
import { motionClass } from '@/lib/motion'
import { readApiJson } from '@/lib/api-response'
import { createClient } from '@/lib/supabase/client'
import { resolveStorageUrl } from '@/lib/storage/media-url'

type VoicePlayerProps = {
  url: string
  conversationId?: string
  duration?: number
  fromCoach?: boolean
  /** Use dark controls when the parent bubble is white/light (coach portal). */
  lightBubble?: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function resolveVoicePlaybackUrl(
  url: string,
  conversationId?: string
): Promise<string | null> {
  if (conversationId) {
    const params = new URLSearchParams({
      conversationId,
      path: url,
    })
    const response = await fetch(`/api/chat/voice-url?${params}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const parsed = await readApiJson<{ url?: string }>(response)
    if (parsed.ok && parsed.data.url) return parsed.data.url
  }

  const supabase = createClient()
  return resolveStorageUrl(supabase, 'chat-voice', url)
}

export function VoicePlayer({
  url,
  conversationId,
  duration,
  fromCoach = false,
  lightBubble = false,
}: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(duration ?? 0)

  useEffect(() => {
    let cancelled = false
    setResolvedUrl(null)
    setLoadError(false)
    setPlaying(false)
    setCurrentTime(0)

    void resolveVoicePlaybackUrl(url, conversationId).then((signed) => {
      if (cancelled) return
      if (!signed) {
        setLoadError(true)
        setResolvedUrl(null)
        return
      }
      setResolvedUrl(signed)
    })
    return () => {
      cancelled = true
    }
  }, [url, conversationId])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio || !resolvedUrl) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    void audio.play().then(() => {
      setPlaying(true)
      setLoadError(false)
    }).catch(() => {
      setPlaying(false)
      setLoadError(true)
    })
  }

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  const inactiveBar = lightBubble ? 'rgba(17,27,33,0.22)' : 'rgba(233,237,239,0.35)'
  const mutedFg = lightBubble ? 'rgba(17,27,33,0.55)' : 'rgba(233,237,239,0.7)'
  const controlFg = lightBubble ? 'rgba(17,27,33,0.75)' : 'rgba(233,237,239,0.85)'
  const controlBg = lightBubble ? 'rgba(17,27,33,0.06)' : 'rgba(255,255,255,0.08)'

  const bars = Array.from({ length: 24 }, (_, i) => {
    const h = 8 + Math.sin(i * 0.8) * 12 + (i % 3) * 4
    const active = totalDuration > 0 && i / 24 <= currentTime / totalDuration
    return (
      <div
        key={i}
        className="waveform-bar"
        style={{
          width: 3,
          height: h,
          borderRadius: 2,
          backgroundColor: active ? '#00a884' : inactiveBar,
          transition: 'background-color 180ms ease',
          animationDelay: playing ? `${i * 40}ms` : undefined,
        }}
      />
    )
  })

  return (
    <div style={{ ...styles.container, ...(fromCoach ? styles.coachVoice : {}) }} className={playing ? motionClass.waveformPlaying : undefined}>
      {fromCoach && (
        <div style={styles.coachLabel}>
          <Mic size={12} color="#00a884" />
          <span>Voice reply from coach</span>
        </div>
      )}
      {resolvedUrl && (
        <audio
          ref={audioRef}
          preload="metadata"
          crossOrigin="anonymous"
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setTotalDuration(audioRef.current?.duration ?? duration ?? 0)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setPlaying(false)
            setLoadError(true)
          }}
          style={styles.hiddenAudio}
        >
          <source src={resolvedUrl} type={resolvedUrl.includes('.webm') ? 'audio/webm' : 'audio/mp4'} />
        </audio>
      )}
      <div style={styles.controlsRow}>
        <button type="button" onClick={togglePlay} className="btn-press" style={styles.playBtn} aria-label={playing ? 'Pause' : 'Play'} disabled={!resolvedUrl}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div style={styles.waveform}>{bars}</div>
        <span style={{ ...styles.time, color: mutedFg }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
        <button type="button" onClick={cycleSpeed} style={{ ...styles.speedBtn, background: controlBg, color: controlFg }}>
          {speed}x
        </button>
        {resolvedUrl && (
          <a href={resolvedUrl} download style={{ ...styles.downloadBtn, color: mutedFg }} aria-label="Download voice message">
            <Download size={16} />
          </a>
        )}
      </div>
      {loadError && (
        <div style={styles.errorText} role="status">
          Unable to load this voice message. Refresh and try again.
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    minWidth: 0,
    width: '100%',
    maxWidth: 260,
    padding: '4px 2px',
    borderRadius: 8,
    backgroundColor: 'transparent',
    border: 'none',
  },
  coachVoice: {
    maxWidth: '100%',
    padding: '2px 0',
  },
  coachLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    color: '#00a884',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    width: '100%',
  },
  hiddenAudio: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#00a884',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  waveform: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    height: 28,
  },
  time: {
    fontSize: 11,
    color: 'rgba(233,237,239,0.7)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  speedBtn: {
    padding: '4px 8px',
    borderRadius: 8,
    border: 'none',
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(233,237,239,0.85)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  downloadBtn: {
    display: 'flex',
    alignItems: 'center',
    color: 'rgba(233,237,239,0.65)',
    padding: 4,
  },
  errorText: {
    fontSize: 11,
    color: '#f87171',
    lineHeight: 1.35,
  },
}
