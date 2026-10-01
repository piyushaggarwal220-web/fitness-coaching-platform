'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { CircleHelp, X } from 'lucide-react'
import { colors, layout, radius } from '@/lib/design-tokens'
import { COACH_ISSUE_CONTACT } from '@/lib/content'

type Turn = { role: 'user' | 'guide'; text: string }

const PLAN_TOPIC =
  /\b(diet|meal|calorie|kcal|macro|protein|workout|exercise|set|rep|cardio|weight loss|fat loss|muscle|what should i eat|what to eat)\b/i

function guideReply(question: string): string {
  const q = question.toLowerCase()
  const howTo = /\b(where|how|open|find|page|button|save|upload)\b/.test(q)
  if (!howTo && PLAN_TOPIC.test(q)) {
    return 'I only help you use the app. Food, calories, and workouts belong in Assistant coach.'
  }
  if (/pg|hostel|mess|tiffin|canteen/.test(q)) {
    return 'Open My Plan and use PG or hostel menu. Type this week’s meals or upload a photo, then save. The next diet uses that menu. Today’s plan stays as it is until a new one is published.'
  }
  if (/plan change|lock in|edit my plan|3 |three/.test(q)) {
    return 'You can lock in 3 plan changes a day on My Plan. One is written at a time. After it is sent, you can use another try the same day. The count resets tomorrow.'
  }
  if (/date|11|october|oct|tomorrow|from today/.test(q)) {
    return 'A future date does not change today’s plan. Say “from today” only if you want the change now. Otherwise lock it in on the start date.'
  }
    if (/call|whatsapp|coach reply|available/.test(q)) {
    return 'Write it in Coach chat. Diet, workouts, and plan questions are handled there.'
  }
  if (/assistant|bot|smart coach|who am i talking/.test(q)) {
    return 'Coach chat answers plan questions. App guide, this button, only explains the app.'
  }
  if (/tracker|check.?in|log/.test(q)) {
    return 'The tracker follows the published plan. A chat message does not change it. Log meals and workouts on Tracker. Check-ins are on their own page from Home.'
  }
  if (/journey|photo/.test(q)) {
    return 'Journey keeps weekly check-ins and progress photos. The compare strip is this week next to the week before.'
  }
  if (/refund|cancel|price|1699|₹/.test(q)) {
    return `This chat cannot change a payment or start a refund. ${COACH_ISSUE_CONTACT}`
  }
  return 'I can help with My Plan, the tracker, Journey, the PG menu, and the 3 daily plan changes. Diet and workout questions go to Assistant coach.'
}

export function AppGuide({ aboveNav }: { aboveNav: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: 'guide',
      text: 'App guide. I explain how LURVOX works. I do not change your diet or workout.',
    },
  ])

  const lift = pathname.startsWith('/tracker/workout') ? 88 : 12
  const bottom = aboveNav
    ? `calc(${layout.bottomNavHeight}px + env(safe-area-inset-bottom) + ${lift}px)`
    : 'calc(16px + env(safe-area-inset-bottom))'

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setTurns((prev) => [...prev, { role: 'user', text }, { role: 'guide', text: guideReply(text) }])
  }

  return (
    <div style={{ position: 'fixed', left: 16, bottom, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: open ? 'min(360px, calc(100vw - 32px))' : 'auto' }}>
      {open && (
        <div
          style={{
            marginBottom: 10,
            height: 380,
            maxHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: radius.lg,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgCard,
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${colors.divider}` }}>
            <div>
              <p style={{ margin: 0, fontWeight: 800, color: colors.textPrimary }}>App guide</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>How to use LURVOX.</p>
            </div>
            <button type="button" aria-label="Close app guide" onClick={() => setOpen(false)} style={{ border: 'none', background: 'transparent', color: colors.textSecondary, cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {turns.map((turn, index) => (
              <div
                key={`${turn.role}-${index}`}
                style={{
                  alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  padding: '8px 10px',
                  borderRadius: 12,
                  background: turn.role === 'user' ? colors.accent : colors.bgElevated,
                  color: turn.role === 'user' ? colors.textInverse : colors.textPrimary,
                  fontSize: 14,
                  lineHeight: 1.4,
                }}
              >
                {turn.text}
              </div>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
            style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${colors.divider}` }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask how something works"
              aria-label="Ask the app guide"
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: radius.sm,
                border: `1px solid ${colors.borderSubtle}`,
                background: colors.bgElevated,
                color: colors.textPrimary,
                padding: '0 10px',
              }}
            />
            <button type="submit" style={{ minHeight: 40, padding: '0 12px', border: 'none', borderRadius: radius.sm, background: colors.accent, color: colors.textInverse, fontWeight: 700, cursor: 'pointer' }}>
              Send
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{
          marginLeft: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 48,
          padding: '0 14px',
          border: 'none',
          borderRadius: 999,
          background: colors.accent,
          color: colors.textInverse,
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(249, 115, 22, 0.35)',
        }}
      >
        <CircleHelp size={18} />
        App guide
      </button>
    </div>
  )
}
