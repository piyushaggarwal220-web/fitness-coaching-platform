'use client'

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { authenticateClient } from '@/lib/onboarding'
import {
  createIssueReport,
  collectSystemInfo,
  ISSUE_CATEGORIES,
  ISSUE_TOPICS,
  supportCategoryForIssue,
} from '@/lib/issue-reports'
import { createSupportRequest } from '@/lib/support'
import { brandTitle } from '@/lib/brand'
import { colors } from '@/lib/design-tokens'
import { mobileStyles } from '@/lib/mobile-styles'
import { createClient } from '@/lib/supabase/client'
import type { IssueCategory, IssueReport, IssueTopic } from '@/types/database'

const supabase = createClient()

function isReviewCategory(category: IssueCategory | ''): boolean {
  return category === 'plan_review' || category === 'platform_review'
}

export default function ReportIssuePage() {
  const router = useRouter()
  const [category, setCategory] = useState<IssueCategory | ''>('')
  const [topic, setTopic] = useState<IssueTopic | ''>('')
  const [rating, setRating] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [includeSystemInfo, setIncludeSystemInfo] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [pastReports, setPastReports] = useState<IssueReport[]>([])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const about = params.get('about')
    if (about === 'plan' || about === 'tracker' || about === 'platform') {
      setTopic(about)
    }
    const kind = params.get('kind')
    if (kind === 'plan_review' || kind === 'plan_complaint' || kind === 'platform_review' || kind === 'bug') {
      setCategory(kind)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const auth = await authenticateClient(supabase, router, { requirePayment: true })
      if (!auth?.profile) return
      const { data } = await supabase
        .from('issue_reports')
        .select('*')
        .eq('client_id', auth.profile.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setPastReports((data as IssueReport[]) ?? [])
    }
    void load()
  }, [router])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      setError('Please describe what you liked, disliked, or what went wrong.')
      return
    }
    if (isReviewCategory(category) && (rating < 1 || rating > 5)) {
      setError('Please give a 1–5 star rating for your review.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const auth = await authenticateClient(supabase, router, { requirePayment: true })
      if (!auth?.profile) throw new Error('Not authenticated')

      let screenshotUrl: string | null = null
      if (screenshot) {
        const path = `${auth.profile.id}/${Date.now()}_${screenshot.name}`
        const { error: uploadError } = await supabase.storage.from('issue-screenshots').upload(path, screenshot)
        if (uploadError) throw new Error(uploadError.message)
        screenshotUrl = path
      }

      const { error: submitError } = await createIssueReport(supabase, {
        clientId: auth.profile.id,
        category: category || null,
        topic: topic || null,
        rating: rating > 0 ? rating : null,
        description,
        screenshotUrl,
        systemInfo: includeSystemInfo ? collectSystemInfo() : null,
      })

      if (submitError) throw new Error(submitError)

      const supportCategory = supportCategoryForIssue(category || null)
      if (supportCategory) {
        const title =
          ISSUE_CATEGORIES.find((c) => c.value === category)?.label ??
          description.trim().slice(0, 80)
        await createSupportRequest(supabase, auth.profile.id, {
          category: supportCategory,
          title,
          message: rating > 0 ? `${rating}/5\n\n${description.trim()}` : description.trim(),
          priority: category === 'plan_complaint' ? 'high' : 'normal',
        })
      }

      setSuccess(true)
      setDescription('')
      setScreenshot(null)
      setCategory('')
      setTopic('')
      setRating(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClientShell title="Feedback" hideBottomNav>
      <h1 style={mobileStyles.title}>{brandTitle('Feedback')}</h1>
      <p style={mobileStyles.subtitle}>
        Rate your plan, report a problem with the tracker or app, or send a complaint. Coaches see plan feedback; the team sees app issues.
      </p>

      {success && (
        <div style={mobileStyles.success}>
          Thank you. We received your feedback.
        </div>
      )}
      {error && <div style={mobileStyles.error}>{error}</div>}

      <form onSubmit={(e) => void handleSubmit(e)} style={mobileStyles.card}>
        <label style={labelStyle}>This is about</label>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value as IssueTopic | '')}
          style={mobileStyles.input}
        >
          <option value="">Choose one</option>
          {ISSUE_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <label style={labelStyle}>Type</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as IssueCategory | '')}
          style={mobileStyles.input}
        >
          <option value="">Select a type</option>
          {ISSUE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <label style={labelStyle}>
          {isReviewCategory(category) ? 'Star rating *' : 'Star rating (optional)'}
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
              style={{
                fontSize: 28,
                lineHeight: 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: star <= rating ? '#f59e0b' : colors.textMuted,
              }}
            >
              ★
            </button>
          ))}
        </div>

        <label style={labelStyle}>Your message *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={5}
          placeholder="What should we keep, change, or fix?"
          style={{ ...mobileStyles.input, resize: 'vertical', marginBottom: 12 }}
        />

        <label style={labelStyle}>Screenshot (optional)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
          style={{ marginBottom: 12, fontSize: 14, color: colors.textSecondary }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16, cursor: 'pointer', color: colors.textSecondary }}>
          <input type="checkbox" checked={includeSystemInfo} onChange={(e) => setIncludeSystemInfo(e.target.checked)} />
          Include device info (helps with bugs)
        </label>

        <button type="submit" disabled={submitting} style={{ ...mobileStyles.primaryBtn, width: '100%' }}>
          {submitting ? 'Submitting...' : 'Send feedback'}
        </button>
      </form>

      {pastReports.length > 0 && (
        <div style={mobileStyles.card}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: colors.textPrimary }}>Your feedback</h2>
          {pastReports.map((r) => (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.divider}`, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500, color: colors.textPrimary }}>{r.description.slice(0, 60)}{r.description.length > 60 ? '…' : ''}</span>
                <span style={{ color: colors.textMuted, fontSize: 12, textTransform: 'capitalize' }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                {r.rating ? `${r.rating}/5 · ` : ''}
                {new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </ClientShell>
  )
}

const labelStyle: CSSProperties = { display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6, marginTop: 12, color: colors.textSecondary }
