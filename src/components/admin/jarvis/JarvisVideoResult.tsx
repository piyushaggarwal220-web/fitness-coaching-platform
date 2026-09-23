'use client'

import { j2, glassPanel, ghostBtn, solidBtn, dangerBtn } from './styles'

export type VideoResultModel = {
  title?: string
  duration?: string | null
  aspect_ratio?: string | null
  source?: string | null
  concept?: string | null
  hook?: string | null
  captions?: string | null
  cost?: string | null
  status?: string | null
  preview_url?: string | null
  publishing_enabled?: boolean
}

export function JarvisVideoResult({
  video,
  onApprove,
  onReject,
  onRevise,
  onVariation,
  onDetails,
}: {
  video: VideoResultModel
  onApprove?: () => void
  onReject?: () => void
  onRevise?: () => void
  onVariation?: () => void
  onDetails?: () => void
}) {
  return (
    <article style={{ ...glassPanel, padding: 14 }} aria-label="Video ready">
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.amber, fontWeight: 700 }}>
        Video ready
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: j2.text }}>
        {video.title || 'Rendered cut'}
      </div>
      {video.preview_url ? (
        <video
          src={video.preview_url}
          controls
          preload="metadata"
          style={{
            width: '100%',
            marginTop: 10,
            borderRadius: 10,
            background: '#000',
            maxHeight: 280,
          }}
        />
      ) : (
        <div
          style={{
            marginTop: 10,
            height: 120,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: `1px dashed ${j2.glassBorder}`,
            display: 'grid',
            placeItems: 'center',
            color: j2.muted,
            fontSize: 12,
          }}
        >
          Preview unavailable · open details for render package
        </div>
      )}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 12px',
          margin: '12px 0 0',
          fontSize: 12,
        }}
      >
        <Meta label="Duration" value={video.duration} />
        <Meta label="Aspect" value={video.aspect_ratio} />
        <Meta label="Source" value={video.source} />
        <Meta label="Status" value={video.status || 'READY'} />
        <Meta label="Concept" value={video.concept} />
        <Meta label="Hook" value={video.hook} />
        <Meta label="Captions" value={video.captions} />
        <Meta label="Cost" value={video.cost} />
      </dl>
      {!video.publishing_enabled ? (
        <div style={{ marginTop: 10, fontSize: 12, color: j2.muted }}>
          Publishing disabled · prepare package → approval → wait for live publishing capability
        </div>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {onApprove ? (
          <button type="button" style={solidBtn} onClick={onApprove}>
            Approve
          </button>
        ) : null}
        {onReject ? (
          <button type="button" style={dangerBtn} onClick={onReject}>
            Reject
          </button>
        ) : null}
        {onRevise ? (
          <button type="button" style={ghostBtn} onClick={onRevise}>
            Revise
          </button>
        ) : null}
        {onVariation ? (
          <button type="button" style={ghostBtn} onClick={onVariation}>
            Create variation
          </button>
        ) : null}
        {onDetails ? (
          <button type="button" style={ghostBtn} onClick={onDetails}>
            Open details
          </button>
        ) : null}
      </div>
    </article>
  )
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt style={{ color: j2.muted, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</dt>
      <dd style={{ margin: '2px 0 0', color: j2.text }}>{value || '—'}</dd>
    </div>
  )
}
