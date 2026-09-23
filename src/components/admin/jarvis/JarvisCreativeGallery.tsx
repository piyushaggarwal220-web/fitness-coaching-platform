'use client'

import { j2, glassPanel, ghostBtn, solidBtn, dangerBtn } from './styles'

export type CreativeCardModel = {
  id: string
  headline?: string | null
  primary_text?: string | null
  cta?: string | null
  funnel?: string | null
  concept?: string | null
  status?: string | null
  performance?: string | null
  experiment?: string | null
  preview_url?: string | null
}

export function JarvisCreativeGallery({
  creatives,
  publishingEnabled,
  onApprove,
  onReject,
  onRevise,
  onDuplicate,
  onVariation,
  onAddToExperiment,
}: {
  creatives: CreativeCardModel[]
  publishingEnabled?: boolean
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onRevise?: (id: string) => void
  onDuplicate?: (id: string) => void
  onVariation?: (id: string) => void
  onAddToExperiment?: (id: string) => void
}) {
  if (!creatives.length) {
    return (
      <div style={{ ...glassPanel, padding: 14, color: j2.muted, fontSize: 13 }}>
        No creatives ready for review.
      </div>
    )
  }

  return (
    <section aria-label="Ad creative gallery">
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650, marginBottom: 8 }}>
        Creative gallery
        {!publishingEnabled ? <span style={{ color: j2.amber }}> · live publishing off</span> : null}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {creatives.map((c) => (
          <article key={c.id} style={{ ...glassPanel, padding: 12 }}>
            <div
              style={{
                height: 120,
                borderRadius: 10,
                background: c.preview_url
                  ? `center/cover url(${c.preview_url})`
                  : 'linear-gradient(145deg, rgba(255,98,0,0.12), rgba(255,255,255,0.03))',
                border: `1px solid ${j2.glassBorder}`,
              }}
            />
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: j2.text }}>
              {c.headline || 'Untitled creative'}
            </div>
            {c.primary_text ? (
              <div style={{ fontSize: 12, color: j2.muted, marginTop: 4, lineHeight: 1.4 }}>
                {c.primary_text.slice(0, 120)}
                {c.primary_text.length > 120 ? '…' : ''}
              </div>
            ) : null}
            <div style={{ marginTop: 8, fontSize: 11, color: j2.muted, display: 'grid', gap: 2 }}>
              <span>CTA · {c.cta || '—'}</span>
              <span>Funnel · {c.funnel || '—'}</span>
              <span>Concept · {c.concept || '—'}</span>
              <span>Status · {c.status || 'review'}</span>
              {c.performance ? <span>Performance · {c.performance}</span> : null}
              {c.experiment ? <span>Experiment · {c.experiment}</span> : null}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {onApprove ? (
                <button type="button" style={{ ...solidBtn, padding: '6px 10px', fontSize: 12 }} onClick={() => onApprove(c.id)}>
                  Approve
                </button>
              ) : null}
              {onReject ? (
                <button type="button" style={{ ...dangerBtn, padding: '6px 10px', fontSize: 12 }} onClick={() => onReject(c.id)}>
                  Reject
                </button>
              ) : null}
              {onRevise ? (
                <button type="button" style={{ ...ghostBtn, padding: '6px 10px', fontSize: 12 }} onClick={() => onRevise(c.id)}>
                  Revise
                </button>
              ) : null}
              {onDuplicate ? (
                <button type="button" style={{ ...ghostBtn, padding: '6px 10px', fontSize: 12 }} onClick={() => onDuplicate(c.id)}>
                  Duplicate
                </button>
              ) : null}
              {onVariation ? (
                <button type="button" style={{ ...ghostBtn, padding: '6px 10px', fontSize: 12 }} onClick={() => onVariation(c.id)}>
                  Variation
                </button>
              ) : null}
              {onAddToExperiment ? (
                <button
                  type="button"
                  style={{ ...ghostBtn, padding: '6px 10px', fontSize: 12 }}
                  onClick={() => onAddToExperiment(c.id)}
                >
                  Add to experiment
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
