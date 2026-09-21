'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { formatTime } from '@/lib/jarvis/operator-present'
import { looksLikeRawPayload } from '@/lib/jarvis/operator-cockpit'
import type { ActivityItem } from './types'
import * as s from './styles'

function kindTone(kind: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (kind === 'ERROR') return 'danger'
  if (kind === 'APPROVAL') return 'warn'
  if (kind === 'ACTION') return 'info'
  if (kind === 'RESEARCH') return 'ok'
  return 'muted'
}

export function ActivityView({ items }: { items: ActivityItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>Operations</div>
      <h2 style={{ margin: '6px 0 16px', fontSize: 22, letterSpacing: '-0.03em' }}>Activity</h2>
      {items.length ? (
        items.map((item) => {
          const open = openId === item.id
          const raw = looksLikeRawPayload(item.detail)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              style={{ display: 'flex', gap: 12, marginBottom: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
            >
              <div style={{ width: 48, flexShrink: 0, fontSize: 12, color: colors.textMuted, paddingTop: 12 }}>
                {formatTime(item.at)}
              </div>
              <div style={{ ...s.card, flex: 1 }}>
                <span style={s.badge(kindTone(item.kind))}>{item.kind}</span>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>{item.title}</div>
                {open ? (
                  <div style={s.muted}>
                    {raw ? 'Technical payload hidden. Open Diagnostics for traces.' : item.detail || 'Completed'}
                  </div>
                ) : (
                  <div style={s.muted}>View details</div>
                )}
              </div>
            </button>
          )
        })
      ) : (
        <div style={s.muted}>No activity yet.</div>
      )}
    </div>
  )
}
