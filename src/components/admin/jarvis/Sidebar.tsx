'use client'

import { useState } from 'react'
import {
  Activity,
  BarChart3,
  Brain,
  CheckSquare,
  HeartPulse,
  Camera,
  Film,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  Wand2,
} from 'lucide-react'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { SidebarStatus } from './TopBar'
import { j2 } from './styles'

type NavItem = { id: CommandView; label: string; icon: typeof MessageSquare }

const ITEMS: NavItem[] = [
  { id: 'command', label: 'Command', icon: LayoutDashboard },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'revenue', label: 'Revenue', icon: BarChart3 },
  { id: 'funnels', label: 'Funnels', icon: Store },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'growth', label: 'Growth', icon: TrendingUp },
  { id: 'marketing', label: 'Meta Ads', icon: Megaphone },
  { id: 'creatives', label: 'Creatives', icon: Wand2 },
  { id: 'instagram', label: 'Instagram', icon: Camera },
  { id: 'instagram_intel', label: 'IG Intel', icon: Sparkles },
  { id: 'content_ops', label: 'Content', icon: LayoutDashboard },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'experiments', label: 'Experiments', icon: Sparkles },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'diagnostics', label: 'Diagnostics', icon: HeartPulse },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'learning', label: 'Learning', icon: Lightbulb },
  { id: 'taste', label: 'Taste', icon: Wand2 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function JarvisSidebar({
  jarvis,
  onNavigate,
  rail = true,
}: {
  jarvis: JarvisCommandState
  onNavigate: (view: CommandView) => void
  /** Narrow icon rail — expands labels on hover */
  rail?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const pending = jarvis.pendingApprovals.length
  const width = rail ? (expanded ? 168 : 56) : 196

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        width,
        transition: 'width 0.2s ease',
        background: 'rgba(8,8,10,0.95)',
        borderRight: `1px solid ${j2.glassBorder}`,
      }}
      onMouseEnter={() => rail && setExpanded(true)}
      onMouseLeave={() => rail && setExpanded(false)}
    >
      <div style={{ padding: expanded ? '12px 12px 8px' : '12px 0 8px', textAlign: expanded ? 'left' : 'center' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: j2.muted, fontWeight: 650 }}>
          {expanded ? 'LURVOX' : 'L'}
        </div>
        {expanded ? (
          <div style={{ fontSize: 13, fontWeight: 750, letterSpacing: '-0.03em', marginTop: 2 }}>JARVIS</div>
        ) : null}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 6px 8px' }}>
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = jarvis.view === item.id
          const count = item.id === 'approvals' ? pending : 0
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              onClick={() => onNavigate(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                background: active ? 'rgba(255,98,0,0.1)' : 'transparent',
                color: active ? j2.text : j2.muted,
                border: 'none',
                borderRadius: 8,
                padding: expanded ? '8px 10px' : '10px 0',
                justifyContent: expanded ? 'flex-start' : 'center',
                fontSize: 12,
                fontWeight: active ? 600 : 450,
                cursor: 'pointer',
                marginBottom: 2,
              }}
            >
              <Icon size={15} />
              {expanded ? <span style={{ flex: 1 }}>{item.label}</span> : null}
              {expanded && count ? (
                <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.95)' }}>{count}</span>
              ) : null}
            </button>
          )
        })}
      </div>
      {expanded ? <SidebarStatus jarvis={jarvis} /> : null}
    </div>
  )
}
