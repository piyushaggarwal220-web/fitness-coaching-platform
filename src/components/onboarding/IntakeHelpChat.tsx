'use client'

import { useMemo, useState } from 'react'
import { onboardingStyles as s } from '@/components/onboarding/styles'
import {
  INTAKE_HELP_STARTERS,
  intakeHelpGreeting,
  intakeHelpTranscript,
  replyToIntakeHelp,
} from '@/lib/onboarding/intake-help'
import { createSupportRequest } from '@/lib/support'
import { createClient } from '@/lib/supabase/client'

type ChatLine = { from: 'you' | 'help'; text: string }

type IntakeHelpChatProps = {
  section: string
  step: number
  blockedReason?: string | null
  userId: string | null
}

export function IntakeHelpChat({ section, step, blockedReason, userId }: IntakeHelpChatProps) {
  const greeting = useMemo(() => intakeHelpGreeting(section), [section])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [lines, setLines] = useState<ChatLine[]>([])
  const [offerSend, setOfferSend] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState('')

  function pushHelp(message: string) {
    const reply = replyToIntakeHelp({ message, section, step, blockedReason })
    setLines((current) => [
      ...current,
      { from: 'you', text: message },
      { from: 'help', text: reply.text },
    ])
    setOfferSend(reply.offerSend)
    setSent(false)
    setSendError('')
  }

  async function sendToTeam() {
    if (!userId) {
      setSendError('Sign in first. Then I can send this chat to the team.')
      return
    }
    const transcript = intakeHelpTranscript(
      lines.length ? lines : [{ from: 'help', text: greeting }],
      blockedReason
    )
    if (transcript.trim().length < 10) return
    setSending(true)
    setSendError('')
    const supabase = createClient()
    const { data, error } = await createSupportRequest(supabase, userId, {
      category: 'platform_feedback',
      title: `Coaching intake help · ${section}`.slice(0, 120),
      message: `Sent from coaching intake, step ${step} (${section}).\n\n${transcript}`,
      priority: 'normal',
    })
    setSending(false)
    if (error || !data) {
      setSendError(error ?? 'Could not send this. Try again in a moment.')
      return
    }
    setSent(true)
    setOfferSend(false)
  }

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 'calc(92px + env(safe-area-inset-bottom))', zIndex: 40, width: 'min(360px, calc(100vw - 32px))' }}>
      {open && (
        <div
          style={{
            ...s.card,
            marginBottom: 10,
            padding: 14,
            maxHeight: 'min(70dvh, 520px)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>Intake help</strong>
            <button type="button" onClick={() => setOpen(false)} style={{ ...s.backBtn, minHeight: 36, padding: '6px 10px' }}>
              Close
            </button>
          </div>
          <div style={{ overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ ...s.stepHint, margin: 0 }}>{greeting}</p>
            {lines.map((line, index) => (
              <p
                key={`${line.from}-${index}`}
                style={{
                  ...s.stepHint,
                  margin: 0,
                  padding: '8px 10px',
                  borderRadius: 12,
                  background: line.from === 'you' ? 'rgba(52, 211, 153, 0.15)' : 'transparent',
                }}
              >
                {line.text}
              </p>
            ))}
          </div>
          <div style={{ ...s.chipGrid, marginTop: 10 }}>
            {INTAKE_HELP_STARTERS.map((prompt) => (
              <button key={prompt} type="button" style={s.chip} onClick={() => pushHelp(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          <form
            style={{ display: 'flex', gap: 8, marginTop: 10 }}
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const message = draft.trim()
              if (!message) return
              setDraft('')
              pushHelp(message)
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="What is going wrong?"
              aria-label="Describe the intake problem"
              style={{ ...s.input, minHeight: 44 }}
            />
            <button type="submit" style={{ ...s.nextBtn, flex: '0 0 auto', minHeight: 44, padding: '0 14px' }}>
              Send
            </button>
          </form>
          {offerSend && !sent && (
            <button type="button" onClick={() => void sendToTeam()} disabled={sending} style={{ ...s.nextBtn, marginTop: 8 }}>
              {sending ? 'Sending…' : 'Send this to the team'}
            </button>
          )}
          {sent && <p style={{ ...s.stepHint, margin: '8px 0 0' }}>Sent. The team can see it in support.</p>}
          {sendError && (
            <p style={{ ...s.error, marginTop: 8 }} role="alert">
              {sendError}
            </p>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setOpen((value) => !value)} style={{ ...s.nextBtn, flex: '0 0 auto', minHeight: 44, padding: '0 16px' }}>
          {open ? 'Hide help' : 'Help'}
        </button>
      </div>
    </div>
  )
}
