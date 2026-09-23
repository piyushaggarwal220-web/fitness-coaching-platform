'use client'

import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { colors } from '@/lib/design-tokens'
import { JarvisSidebar } from './Sidebar'
import { ChatPane } from './ChatPane'
import { TasksView } from './TasksView'
import { ApprovalsView } from './ApprovalsView'
import { ActivityView } from './ActivityView'
import { MemoryView } from './MemoryView'
import { LearningCenterView } from './LearningCenterView'
import { TasteView } from './TasteView'
import { InstagramIntelligenceView } from './InstagramIntelligenceView'
import { ContentOpsView } from './ContentOpsView'
import { SettingsView } from './SettingsView'
import { NotificationsView } from './NotificationsView'
import { IntegrationsView } from './IntegrationsView'
import { DiagnosticsView } from './DiagnosticsView'
import { CockpitHome } from './CockpitHome'
import { DomainView } from './DomainViews'
import { JarvisTopBar } from './TopBar'
import { RightRail } from './RightRail'
import { JarvisCommandPalette } from './JarvisCommandPalette'
import { useJarvisCommand, useLayoutMode } from './use-jarvis-command'
import type { CommandView } from './types'
import * as s from './styles'

const DOMAIN_VIEWS: CommandView[] = [
  'revenue',
  'funnels',
  'customers',
  'growth',
  'marketing',
  'creatives',
  'instagram',
  'video',
  'experiments',
]

export function JarvisCommandCenter() {
  const jarvis = useJarvisCommand()
  const mode = useLayoutMode()
  const isDesktop = mode === 'desktop'
  const compact = mode !== 'desktop'
  const [paletteOpen, setPaletteOpen] = useState(false)

  function navigate(view: CommandView) {
    jarvis.setView(view)
    jarvis.setSidebarOpen(false)
    if (view !== 'tasks') jarvis.setSelectedTaskId(null)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (e.key === 'Escape') {
        if (paletteOpen) {
          e.preventDefault()
          setPaletteOpen(false)
          return
        }
        window.dispatchEvent(new CustomEvent('jarvis:interrupt-speech'))
      }
    }
    function onOpenPalette() {
      setPaletteOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('jarvis:open-palette', onOpenPalette)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('jarvis:open-palette', onOpenPalette)
    }
  }, [paletteOpen])

  const main =
    jarvis.view === 'command' ? (
      <CockpitHome jarvis={jarvis} onNavigate={navigate} compact={compact} />
    ) : jarvis.view === 'chat' ? (
      <ChatPane jarvis={jarvis} />
    ) : DOMAIN_VIEWS.includes(jarvis.view) ? (
      <DomainView view={jarvis.view} jarvis={jarvis} onAsk={(q) => void jarvis.sendMessage(q)} />
    ) : jarvis.view === 'tasks' ? (
      <TasksView selectedTaskId={jarvis.selectedTaskId} onSelect={jarvis.setSelectedTaskId} />
    ) : jarvis.view === 'approvals' ? (
      <ApprovalsView
        approvals={jarvis.pendingApprovals}
        busy={jarvis.busy}
        onDecide={jarvis.decide}
        onRevise={(label) => void jarvis.sendMessage(`Modify this approval: ${label}. Propose a safer alternative.`)}
      />
    ) : jarvis.view === 'activity' ? (
      <ActivityView items={jarvis.dashboard?.activity ?? []} />
    ) : jarvis.view === 'memory' ? (
      <MemoryView />
    ) : jarvis.view === 'learning' ? (
      <LearningCenterView />
    ) : jarvis.view === 'taste' ? (
      <TasteView />
    ) : jarvis.view === 'instagram_intel' ? (
      <InstagramIntelligenceView onAsk={(prompt) => void jarvis.sendMessage(prompt)} />
    ) : jarvis.view === 'content_ops' ? (
      <ContentOpsView onAsk={(prompt) => void jarvis.sendMessage(prompt)} />
    ) : jarvis.view === 'integrations' ? (
      <IntegrationsView jarvis={jarvis} />
    ) : jarvis.view === 'diagnostics' ? (
      <DiagnosticsView jarvis={jarvis} />
    ) : jarvis.view === 'settings' ? (
      <SettingsView />
    ) : (
      <NotificationsView />
    )

  const shellHeight = isDesktop ? 'calc(100vh - 100px)' : 'calc(100vh - 104px)'

  return (
    <div style={s.page}>
      <AdminNavbar />
      {jarvis.error && jarvis.view !== 'command' ? (
        <div
          style={{
            background: colors.dangerMuted,
            color: colors.danger,
            padding: '8px 16px',
            fontSize: 13,
            borderBottom: `1px solid ${colors.danger}`,
          }}
        >
          {jarvis.error}
        </div>
      ) : null}

      {isDesktop ? (
        <JarvisTopBar jarvis={jarvis} onNavigate={navigate} />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: `1px solid ${colors.divider}`,
            background: '#0a0a0c',
          }}
        >
          <button type="button" style={s.ghostBtn} onClick={() => jarvis.setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={16} />
          </button>
          <div style={{ fontWeight: 750, letterSpacing: '-0.03em' }}>JARVIS</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={s.ghostBtn} onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
              ⌘K
            </button>
            <button type="button" style={s.ghostBtn} onClick={() => navigate('approvals')}>
              {jarvis.pendingApprovals.length || '—'}
            </button>
          </div>
        </div>
      )}

      <div style={{ ...s.shell, height: shellHeight, minHeight: 420 }}>
        {isDesktop ? (
          <aside style={s.sidebar}>
            <JarvisSidebar jarvis={jarvis} onNavigate={navigate} />
          </aside>
        ) : null}

        <main style={s.main}>{main}</main>

        {isDesktop ? (
          <aside
            style={{
              width: 300,
              flexShrink: 0,
              borderLeft: `1px solid ${colors.borderSubtle}`,
              background: '#0b0b0d',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <RightRail jarvis={jarvis} />
          </aside>
        ) : null}
      </div>

      {jarvis.sidebarOpen && !isDesktop ? (
        <>
          <div style={s.overlay} onClick={() => jarvis.setSidebarOpen(false)} />
          <aside style={s.drawer}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 8 }}>
              <button type="button" style={s.ghostBtn} onClick={() => jarvis.setSidebarOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <JarvisSidebar jarvis={jarvis} onNavigate={navigate} />
          </aside>
        </>
      ) : null}

      <JarvisCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAsk={(prompt) => void jarvis.sendMessage(prompt)}
        onNavigate={navigate}
      />
    </div>
  )
}
