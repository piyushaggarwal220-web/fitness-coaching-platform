'use client'

import { j2, glassPanel } from './styles'

export function JarvisOperationCard({
  title,
  why,
  state,
  duration,
  cost,
  approvalRequired,
  result,
}: {
  title: string
  why?: string
  state: string
  duration?: string
  cost?: string
  approvalRequired?: boolean
  result?: string
}) {
  return (
    <article style={{ ...glassPanel, padding: 14 }} aria-label={title}>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
        Operation
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: j2.text }}>{title}</div>
      {why ? <div style={{ fontSize: 13, color: j2.muted, marginTop: 6 }}>{why}</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, fontSize: 12, color: j2.muted }}>
        <span>State · {state}</span>
        {duration ? <span>Duration · {duration}</span> : null}
        {cost ? <span>Cost · {cost}</span> : null}
        {approvalRequired ? <span style={{ color: 'rgba(251,191,36,0.95)' }}>Approval required</span> : null}
      </div>
      {result ? <div style={{ marginTop: 10, fontSize: 13, color: j2.text }}>{result}</div> : null}
    </article>
  )
}
