'use client'

import { Settings } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { formatUsd } from '@/lib/jarvis/operator-present'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import * as s from './styles'

function healthTone(level?: string): 'ok' | 'warn' | 'danger' {
  if (level === 'action_required') return 'danger'
  if (level === 'partial') return 'warn'
  return 'ok'
}

export function JarvisTopBar({
  jarvis,
  onNavigate,
}: {
  jarvis: JarvisCommandState
  onNavigate: (view: CommandView) => void
}) {
  const health = jarvis.dashboard?.cockpit?.health || jarvis.dashboard?.health
  const freshness = jarvis.dashboard?.cockpit?.freshness
  const unread = jarvis.dashboard?.unread_notifications ?? 0
  const pending = jarvis.pendingApprovals.length
  const tone = healthTone(health?.level)
  const connectedLine =
    jarvis.dashboard?.cockpit?.health.connected_line ||
    (health && health.total_count
      ? `${health.connected_count} connected${health.attention_count ? ` · ${health.attention_count} need attention` : ''}`
      : '')

  return (
    <div style={{ ...s.topBar, height: 44, gap: 14 }}>
      <div style={{ fontWeight: 750, letterSpacing: '-0.04em', fontSize: 12 }}>JARVIS</div>
      <button
        type="button"
        onClick={() => onNavigate('integrations')}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={s.statusDot(tone)} />
        <span style={{ color: colors.textPrimary, fontWeight: 650, fontSize: 13 }}>
          {health?.label || 'Operational'}
        </span>
        <span style={{ color: colors.textMuted, fontSize: 12 }}>{connectedLine}</span>
      </button>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 11, color: freshness?.stale ? colors.warning : colors.textMuted }}>
        {freshness?.label || 'Updated —'}
      </div>
      <button type="button" style={{ ...s.ghostBtn, border: 'none', padding: '4px 6px' }} onClick={() => onNavigate('notifications')}>
        Alerts{unread ? ` ${unread}` : ''}
      </button>
      <button type="button" style={{ ...s.ghostBtn, border: 'none', padding: '4px 6px' }} onClick={() => onNavigate('approvals')}>
        Approvals{pending ? ` ${pending}` : ''}
      </button>
      <button type="button" style={{ ...s.ghostBtn, border: 'none', padding: '4px 6px' }} onClick={() => onNavigate('settings')}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Settings size={12} /> Settings
        </span>
      </button>
    </div>
  )
}

export function SidebarStatus({ jarvis }: { jarvis: JarvisCommandState }) {
  const health = jarvis.dashboard?.cockpit?.health || jarvis.dashboard?.health
  const spent = Number(jarvis.dashboard?.cost?.daily_spent_usd ?? 0)
  const limit = Number(jarvis.dashboard?.cost?.daily_limit_usd ?? jarvis.dashboard?.budgets?.daily_ai_budget_usd ?? 0)
  const autonomy = jarvis.dashboard?.autonomy_level
  const tone = healthTone(health?.level)
  return (
    <div style={{ padding: '10px 12px', borderTop: `1px solid ${colors.borderSubtle}`, fontSize: 11, color: colors.textMuted, lineHeight: 1.45 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={s.statusDot(tone)} />
        <span style={{ color: colors.textSecondary }}>{health?.label || 'Operational'}</span>
      </div>
      <div>Autonomy {autonomy ?? '—'}</div>
      <div>Cost {formatUsd(spent)}{limit ? ` / ${formatUsd(limit)}` : ''}</div>
    </div>
  )
}
