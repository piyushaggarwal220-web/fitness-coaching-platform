'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'

const NEXT_HREF = '/preview4/next'
const TALK_HREF = '/preview4/talk'
const GREETING = 'Any question about the 84 days.'
const CHIPS = ['What do I pay?', 'What do I get?', 'When does the plan arrive?', 'Check-ins'] as const

type Turn = { role: 'user' | 'assistant'; content: string }

export function OfferChat() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])

  async function ask(text: string) {
    const message = text.trim()
    if (!message || busy) return
    const history = turns.slice(-6)
    setTurns((current) => [...current, { role: 'user', content: message }])
    setDraft('')
    setBusy(true)
    try {
      const res = await fetch('/api/marketing/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, surface: 'offer84' }),
      })
      const payload = (await res.json().catch(() => null)) as { reply?: string } | null
      const reply = payload?.reply?.trim() || 'The 84 days are ₹999, paid once. Ask about what is included, check-ins, or when the plan arrives.'
      setTurns((current) => [...current, { role: 'assistant', content: reply }])
    } catch {
      setTurns((current) => [
        ...current,
        { role: 'assistant', content: 'Could not answer that just now. The 84 days are ₹999, paid once.' },
      ])
    }
    setBusy(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void ask(draft)
  }

  return (
    <div className="lx-ask">
      {open ? (
        <section className="lx-ask-panel" aria-label="Questions">
          <header className="lx-ask-head">
            <div>
              <strong>LURVOX</strong>
              <p>About the 84 days</p>
            </div>
            <button type="button" className="lx-ask-close" onClick={() => setOpen(false)} aria-label="Close questions">
              ×
            </button>
          </header>
          <div className="lx-ask-log">
            <p className="lx-ask-bot">{GREETING}</p>
            {turns.map((turn, index) => (
              <p key={`${turn.role}-${index}`} className={turn.role === 'user' ? 'lx-ask-user' : 'lx-ask-bot'}>
                {turn.content}
              </p>
            ))}
            {busy ? <p className="lx-ask-bot">One moment.</p> : null}
          </div>
          {turns.length === 0 ? (
            <div className="lx-ask-chips">
              {CHIPS.map((chip) => (
                <button key={chip} type="button" onClick={() => void ask(chip)} disabled={busy}>
                  {chip}
                </button>
              ))}
            </div>
          ) : null}
          <form className="lx-ask-form" onSubmit={submit}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask a question"
              aria-label="Your question"
              maxLength={500}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
          <p className="lx-ask-links">
            <Link href={NEXT_HREF}>See how it runs</Link>
            <Link href={TALK_HREF}>Talk to a coach</Link>
          </p>
        </section>
      ) : null}
      <button
        type="button"
        className="lx-ask-fab"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Close' : 'Ask'}
      </button>
    </div>
  )
}
