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
import { JarvisCommandPalette } from './JarvisCommandPalette'
import { useJarvisCommand, useLayoutMode } from './use-jarvis-command'
import type { CommandView } from './types'
import * as s from './styles'
import { j2 } from './styles'

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

  // Compact admin chrome: ~36px navbar + 36px topbar on desktop
  const shellHeight = isDesktop ? 'calc(100vh - 72px)' : 'calc(100vh - 88px)'

  return (
    <div style={{ ...s.page, background: j2.bg }}>
      <AdminNavbar compact />
      {jarvis.error && jarvis.view !== 'command' ? (
        <div
          style={{
            background: colors.dangerMuted,
            color: colors.danger,
            padding: '6px 12px',
            fontSize: 12,
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
            padding: '6px 10px',
            borderBottom: `1px solid ${j2.glassBorder}`,
            background: 'rgba(8,8,10,0.95)',
            height: 40,
          }}
        >
          <button type="button" style={s.ghostBtn} onClick={() => jarvis.setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={16} />
          </button>
          <div style={{ fontWeight: 750, letterSpacing: '-0.03em', fontSize: 13 }}>JARVIS</div>
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
          <aside style={{ flexShrink: 0 }}>
            <JarvisSidebar jarvis={jarvis} onNavigate={navigate} rail />
          </aside>
        ) : null}

        <main style={{ ...s.main, background: 'transparent' }}>{main}</main>
      </div>

      {jarvis.sidebarOpen && !isDesktop ? (
        <>
          <div style={s.overlay} onClick={() => jarvis.setSidebarOpen(false)} />
          <aside style={{ ...s.drawer, width: 220, background: '#08080a' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 8 }}>
              <button type="button" style={s.ghostBtn} onClick={() => jarvis.setSidebarOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <JarvisSidebar jarvis={jarvis} onNavigate={navigate} rail={false} />
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
