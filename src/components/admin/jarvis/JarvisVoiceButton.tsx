'use client'

/**
 * Large mic control near Jarvis core — wraps Phase 11 VoiceOperatorPanel.
 * No always-on mic. No wake word. Space = hold-to-talk when focused here.
 */

import { VoiceOperatorPanel } from './VoiceOperatorPanel'
import type { JarvisCommandState } from './use-jarvis-command'
import { j2, glassPanel } from './styles'

export function JarvisVoiceButton({
  jarvis,
  compact,
}: {
  jarvis: JarvisCommandState
  compact?: boolean
}) {
  return (
    <div style={{ ...glassPanel, padding: compact ? 10 : 14 }} aria-label="Voice controls">
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
        Voice · hold to talk
      </div>
      <div style={{ marginTop: 8 }}>
        <VoiceOperatorPanel
          conversationId={jarvis.conversationId}
          onVoiceResult={jarvis.ingestVoiceResult}
          busy={jarvis.busy}
          compact={compact}
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: j2.muted }}>
        Space hold-to-talk when mic is focused · Esc stops speech only · never auto-approves
      </div>
    </div>
  )
}
