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
import * as s from './styles'

type NavItem = { id: CommandView; label: string; icon: typeof MessageSquare; count?: 'approvals' | 'alerts' }

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Jarvis',
    items: [
      { id: 'command', label: 'Command Center', icon: LayoutDashboard },
      { id: 'chat', label: 'Chat', icon: MessageSquare },
    ],
  },
  {
    title: 'Business',
    items: [
      { id: 'revenue', label: 'Revenue', icon: BarChart3 },
      { id: 'funnels', label: 'Funnels', icon: Store },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { id: 'marketing', label: 'Meta Ads', icon: Megaphone },
      { id: 'creatives', label: 'Creatives', icon: Wand2 },
      { id: 'instagram', label: 'Instagram', icon: Camera },
      { id: 'instagram_intel', label: 'IG Intelligence', icon: Sparkles },
      { id: 'content_ops', label: 'Content Ops', icon: LayoutDashboard },
      { id: 'video', label: 'Video', icon: Film },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'tasks', label: 'Tasks', icon: CheckSquare },
      { id: 'approvals', label: 'Approvals', icon: ShieldCheck, count: 'approvals' },
      { id: 'activity', label: 'Activity', icon: Activity },
      { id: 'diagnostics', label: 'Diagnostics', icon: HeartPulse },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'integrations', label: 'Integrations', icon: Plug },
      { id: 'memory', label: 'Memory', icon: Brain },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

const QUIET: NavItem[] = [
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'growth', label: 'Growth', icon: TrendingUp },
  { id: 'experiments', label: 'Experiments', icon: Sparkles },
  { id: 'learning', label: 'Learning', icon: Lightbulb },
  { id: 'taste', label: 'Taste', icon: Wand2 },
]

export function JarvisSidebar({
  jarvis,
  onNavigate,
}: {
  jarvis: JarvisCommandState
  onNavigate: (view: CommandView) => void
}) {
  const unread = jarvis.dashboard?.unread_notifications ?? 0
  const pending = jarvis.pendingApprovals.length
  const openIncidents = jarvis.dashboard?.open_incidents ?? 0
  const [quietOpen, setQuietOpen] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={s.brandMark}>
        <div style={s.eyebrow}>LURVOX</div>
        <div style={s.brandTitle}>JARVIS</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 8 }}>
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div style={s.navSection}>{group.title}</div>
            {group.items.map((item) => {
              const Icon = item.icon
              const count =
                item.id === 'approvals'
                  ? pending
                  : item.id === 'diagnostics'
                    ? openIncidents
                    : item.id === 'notifications'
                      ? unread
                      : 0
              const active =
                jarvis.view === item.id ||
                (item.id === 'command' && jarvis.view === 'command')
              return (
                <button key={item.id} type="button" style={s.navBtn(active)} onClick={() => onNavigate(item.id)}>
                  <Icon size={14} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {count ? <span style={s.badge(item.id === 'approvals' || item.id === 'diagnostics' ? 'warn' : 'info')}>{count}</span> : null}
                </button>
              )
            })}
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => setQuietOpen((open) => !open)}
            style={{ ...s.navSection, background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
          >
            Later {quietOpen ? '–' : '+'}
          </button>
          {quietOpen
            ? QUIET.map((item) => {
                const Icon = item.icon
                const active = jarvis.view === item.id
                return (
                  <button key={item.id} type="button" style={s.navBtn(active)} onClick={() => onNavigate(item.id)}>
                    <Icon size={14} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                  </button>
                )
              })
            : null}
        </div>
      </div>
      <SidebarStatus jarvis={jarvis} />
    </div>
  )
}
