'use client'

import { Settings } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import * as s from './styles'
import { j2 } from './styles'

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
  const unread = jarvis.dashboard?.unread_notifications ?? 0
  const pending = jarvis.pendingApprovals.length
  const tone = healthTone(health?.level)
  const connected = health?.connected_count
  const attention = health?.attention_count ?? pending
  const voice = jarvis.dashboard?.realtime?.modalities?.voice_input || jarvis.dashboard?.realtime?.status
  const voiceNote = (jarvis.dashboard?.realtime as { note?: string } | undefined)?.note

  return (
    <div
      style={{
        ...s.topBar,
        height: 36,
        gap: 12,
        padding: '0 12px',
        background: 'rgba(8,8,10,0.92)',
        borderBottom: `1px solid ${j2.glassBorder}`,
      }}
    >
      <div style={{ fontWeight: 750, letterSpacing: '-0.04em', fontSize: 12 }}>JARVIS</div>
      <span style={s.statusDot(tone)} />
      <span style={{ color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>
        {health?.level === 'action_required' ? 'ATTENTION' : 'ONLINE'}
      </span>
      {typeof connected === 'number' ? (
        <span style={{ color: j2.muted, fontSize: 11 }}>{connected} connected</span>
      ) : null}
      {attention ? <span style={{ color: j2.muted, fontSize: 11 }}>{attention} attention</span> : null}
      <div style={{ flex: 1 }} />
      <span
        title={voiceNote || undefined}
        style={{ fontSize: 11, color: j2.muted, cursor: 'help' }}
      >
        ● Voice {voice === 'CONNECTED' ? 'ready' : voice === 'DISABLED' ? 'off' : 'unavailable'}
      </span>
      <button
        type="button"
        style={{ ...s.ghostBtn, border: 'none', padding: '2px 6px', fontSize: 11 }}
        onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-palette'))}
        aria-label="Open command palette"
      >
        ⌘K
      </button>
      <button
        type="button"
        style={{ ...s.ghostBtn, border: 'none', padding: '2px 6px', fontSize: 11 }}
        onClick={() => onNavigate('approvals')}
      >
        Approvals{pending ? ` ${pending}` : ''}
      </button>
      <button
        type="button"
        style={{ ...s.ghostBtn, border: 'none', padding: '2px 6px', fontSize: 11 }}
        onClick={() => onNavigate('notifications')}
      >
        Alerts{unread ? ` ${unread}` : ''}
      </button>
      <button
        type="button"
        style={{ ...s.ghostBtn, border: 'none', padding: '2px 6px' }}
        onClick={() => onNavigate('settings')}
        aria-label="Settings"
      >
        <Settings size={12} />
      </button>
    </div>
  )
}

export function SidebarStatus({ jarvis }: { jarvis: JarvisCommandState }) {
  const health = jarvis.dashboard?.cockpit?.health || jarvis.dashboard?.health
  const tone = healthTone(health?.level)
  return (
    <div style={{ padding: '8px', borderTop: `1px solid ${j2.glassBorder}`, fontSize: 10, color: j2.muted }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={s.statusDot(tone)} />
        <span>{health?.label || 'Operational'}</span>
      </div>
    </div>
  )
}
