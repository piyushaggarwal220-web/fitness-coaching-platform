'use client'

type VoicePlayerProps = {
  url: string
  duration?: number
}

export function VoicePlayer({ url, duration }: VoicePlayerProps) {
  return (
    <div style={styles.container}>
      <span style={styles.icon}>🎙</span>
      <audio src={url} controls style={styles.audio} preload="metadata" />
      {duration != null && <span style={styles.duration}>{duration}s</span>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 },
  icon: { fontSize: 18 },
  audio: { height: 32, flex: 1, maxWidth: 200 },
  duration: { fontSize: 12, opacity: 0.7 },
}
