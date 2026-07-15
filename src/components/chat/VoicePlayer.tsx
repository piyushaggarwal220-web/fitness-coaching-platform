'use client'

import { useRef, useState } from 'react'
import { Download, Mic, Pause, Play } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { motionClass } from '@/lib/motion'

type VoicePlayerProps = {
  url: string
  duration?: number
  fromCoach?: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function VoicePlayer({ url, duration, fromCoach = false }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(duration ?? 0)

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    void audio.play().then(() => {
      setPlaying(true)
    }).catch(() => {
      setPlaying(false)
    })
  }

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

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
          backgroundColor: active ? colors.accent : colors.borderSubtle,
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
          <Mic size={12} color={colors.accent} />
          <span>Voice reply from coach</span>
        </div>
      )}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setTotalDuration(audioRef.current?.duration ?? duration ?? 0)}
        onEnded={() => setPlaying(false)}
        style={{ display: 'none' }}
      />
      <button type="button" onClick={togglePlay} className="btn-press" style={styles.playBtn} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div style={styles.waveform}>{bars}</div>
      <span style={styles.time}>
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </span>
      <button type="button" onClick={cycleSpeed} style={styles.speedBtn}>
        {speed}x
      </button>
      <a href={url} download style={styles.downloadBtn} aria-label="Download voice message">
        <Download size={16} />
      </a>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    width: '100%',
    maxWidth: 280,
    padding: '8px 10px',
    borderRadius: 16,
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
  },
  coachVoice: {
    flexDirection: 'column',
    alignItems: 'stretch',
    maxWidth: '100%',
    padding: 12,
  },
  coachLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: colors.accent,
    color: colors.textInverse,
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
    height: 32,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  speedBtn: {
    padding: '4px 8px',
    borderRadius: 8,
    border: `1px solid ${colors.borderSubtle}`,
    background: 'transparent',
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  downloadBtn: {
    display: 'flex',
    alignItems: 'center',
    color: colors.textMuted,
    padding: 4,
  },
}
