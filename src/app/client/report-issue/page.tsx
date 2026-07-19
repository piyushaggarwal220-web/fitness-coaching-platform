'use client'

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { authenticateClient } from '@/lib/onboarding'
import { createIssueReport, collectSystemInfo, ISSUE_CATEGORIES } from '@/lib/issue-reports'
import { brandTitle } from '@/lib/brand'
import { colors } from '@/lib/design-tokens'
import { mobileStyles } from '@/lib/mobile-styles'
import { createClient } from '@/lib/supabase/client'
import type { IssueCategory, IssueReport } from '@/types/database'

const supabase = createClient()

export default function ReportIssuePage() {
  const router = useRouter()
  const [category, setCategory] = useState<IssueCategory | ''>('')
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [includeSystemInfo, setIncludeSystemInfo] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [pastReports, setPastReports] = useState<IssueReport[]>([])

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
    if (!description.trim()) { setError('Please describe the issue.'); return }

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
        description,
        screenshotUrl,
        systemInfo: includeSystemInfo ? collectSystemInfo() : null,
      })

      if (submitError) throw new Error(submitError)
      setSuccess(true)
      setDescription('')
      setScreenshot(null)
      setCategory('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClientShell title="Report an Issue" hideBottomNav>
      <h1 style={mobileStyles.title}>{brandTitle('Report an Issue')}</h1>
      <p style={mobileStyles.subtitle}>Let us know if something isn&apos;t working correctly.</p>

      {success && (
        <div style={mobileStyles.success}>
          Thank you! Your report has been submitted. We&apos;ll look into it.
        </div>
      )}
      {error && <div style={mobileStyles.error}>{error}</div>}

      <form onSubmit={(e) => void handleSubmit(e)} style={mobileStyles.card}>
        <label style={labelStyle}>Category (optional)</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)} style={mobileStyles.input}>
          <option value="">Select a category</option>
          {ISSUE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <label style={labelStyle}>Describe the issue *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={5}
          placeholder="What happened? What did you expect?"
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
          Include system information (browser, screen size)
        </label>

        <button type="submit" disabled={submitting} style={{ ...mobileStyles.primaryBtn, width: '100%' }}>
          {submitting ? 'Submitting...' : 'Submit Report'}
        </button>
      </form>

      {pastReports.length > 0 && (
        <div style={mobileStyles.card}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: colors.textPrimary }}>Your Reports</h2>
          {pastReports.map((r) => (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.divider}`, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500, color: colors.textPrimary }}>{r.description.slice(0, 60)}...</span>
                <span style={{ color: colors.textMuted, fontSize: 12, textTransform: 'capitalize' }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </ClientShell>
  )
}

const labelStyle: CSSProperties = { display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6, marginTop: 12, color: colors.textSecondary }
