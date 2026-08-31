'use client'

import { useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { coachRequiresManualPlanDelivery } from '@/lib/coach-delivery-policy'
import { colors } from '@/lib/coach-theme'
import { coachPageStyles as pageStyles } from '@/lib/coach-page-styles'
import type { CoachClientDetail } from '@/types/database'

type CoachClientJourneyPlanEditProps = {
  client: CoachClientDetail
  coachId: string
  onSaved: (updated: CoachClientDetail) => void
}

const supabase = createClient()

export function CoachClientJourneyPlanEdit({ client, coachId, onSaved }: CoachClientJourneyPlanEditProps) {
  const [journeyGoal, setJourneyGoal] = useState(client.journey_goal ?? '')
  const [journeySummary, setJourneySummary] = useState(client.journey_summary ?? '')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')

  const manualDelivery = coachRequiresManualPlanDelivery(coachId)
  const journeySaved = Boolean(client.journey_goal?.trim())
  const canGenerateDraft =
    manualDelivery &&
    journeySaved &&
    !client.plan_delivered &&
    client.onboarding_complete === true

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    const goal = journeyGoal.trim() || null
    const summary = journeySummary.trim() || null

    const { error } = await supabase
      .from('profiles')
      .update({
        journey_goal: goal,
        journey_summary: summary,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id)

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setJourneyGoal(goal ?? '')
    setJourneySummary(summary ?? '')
    onSaved({ ...client, journey_goal: goal, journey_summary: summary })
    setMessage(
      manualDelivery && goal
        ? 'Journey plan saved. Generate an AI draft when you are ready to review it.'
        : 'Journey plan saved. Every AI diet/workout update will include this.'
    )
    setSaving(false)
  }

  const handleGenerateDraft = async () => {
    if (!journeyGoal.trim()) {
      setMessage('Save a journey goal before generating a draft.')
      return
    }

    setGenerating(true)
    setMessage('')

    const response = await fetch(`/api/coach/clients/${client.id}/start-initial-plan`, {
      method: 'POST',
      credentials: 'include',
    })
    const result = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string; draftPlanId?: string; status?: string }
      | null

    setGenerating(false)

    if (!response.ok || !result?.success) {
      setMessage(result?.error ?? 'Could not start plan generation.')
      return
    }

    if (result.draftPlanId) {
      setMessage('Draft is ready — open it from your work queue to review and deliver.')
      return
    }

    setMessage(
      'AI draft generation started. It will appear in your work queue when ready for review.'
    )
  }

  return (
    <section id="journey-plan" style={styles.card}>
      <h2 style={styles.title}>Journey plan (AI memory)</h2>
      <p style={styles.lede}>
        {manualDelivery
          ? 'Step 1: After a coach call, write the long-term roadmap and current phase. Step 2: Generate an AI draft. Step 3: Review the draft and deliver it to the client — nothing is sent automatically.'
          : 'After a coach call, set the long-term roadmap and where the client is right now. AI uses this on every plan update so diet calories and food choices stay aligned with their phase.'}
      </p>

      {client.client_goal_details?.trim() ? (
        <div style={styles.clientBlock}>
          <p style={styles.clientLabel}>Client&apos;s goal description</p>
          <p style={styles.clientText}>{client.client_goal_details.trim()}</p>
        </div>
      ) : null}

      <label style={styles.label}>
        Journey goal
        <span style={styles.labelHint}>Full roadmap — e.g. “Weeks 1–8 aggressive fat loss (~500 kcal deficit), weeks 9–12 reverse +10% kcal every 2 weeks, then maintenance.”</span>
        <textarea
          value={journeyGoal}
          onChange={(e) => setJourneyGoal(e.target.value)}
          rows={4}
          style={styles.textarea}
          placeholder="Describe the multi-phase plan you agreed with the client…"
        />
      </label>

      <label style={styles.label}>
        Current journey status
        <span style={styles.labelHint}>Update after each call or phase change — e.g. “Week 6 of cut, weight stalled 2 weeks, holding calories, adding steps before any cut.”</span>
        <textarea
          value={journeySummary}
          onChange={(e) => setJourneySummary(e.target.value)}
          rows={3}
          style={styles.textarea}
          placeholder="Where they are in the roadmap today…"
        />
      </label>

      <p style={styles.note}>
        Clients can also request changes from <strong>My Plan → Request a change</strong>. Approved edits
        are remembered in the journey snapshot. For a new phase (e.g. starting reverse), update the fields
        here — that is the source of truth for AI.
      </p>

      <div style={styles.actions}>
        <button type="button" onClick={handleSave} disabled={saving || generating} style={pageStyles.primaryBtn}>
          {saving ? 'Saving…' : 'Save journey plan'}
        </button>
        {canGenerateDraft ? (
          <button
            type="button"
            onClick={() => void handleGenerateDraft()}
            disabled={generating || saving || !journeyGoal.trim()}
            style={pageStyles.secondaryBtn}
          >
            {generating ? 'Starting draft…' : 'Generate initial plan draft'}
          </button>
        ) : null}
      </div>
      {message ? <p style={styles.message}>{message}</p> : null}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    ...pageStyles.card,
    display: 'grid',
    gap: 14,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  lede: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: colors.textSecondary,
  },
  clientBlock: {
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgPrimary,
  },
  clientLabel: {
    margin: '0 0 6px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  clientText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap',
  },
  label: {
    display: 'grid',
    gap: 6,
    fontSize: 14,
    fontWeight: 600,
    color: colors.textSecondary,
  },
  labelHint: {
    fontSize: 12,
    fontWeight: 400,
    color: colors.textMuted,
    lineHeight: 1.45,
  },
  textarea: {
    width: '100%',
    minHeight: 88,
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgCard,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 1.5,
    resize: 'vertical',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  note: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.45,
    color: colors.textMuted,
  },
  actions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  message: {
    margin: 0,
    fontSize: 13,
    color: colors.success,
  },
}
