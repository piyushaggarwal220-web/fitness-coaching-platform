'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { COACHING_PLAN_LIST } from '@/lib/payments/plans'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import type { RedemptionCode } from '@/types/database'

type CodeRow = RedemptionCode & {
  redemption_usages?: {
    user_id: string
    redeemed_at: string
    profiles?: { email: string | null; name: string | null } | null
  }[]
}

type CodeFormState = {
  code: string
  planSlug: string
  maxRedemptions: number
  membershipExpiresAt: string
  expiresAt: string
  isReusable: boolean
  memberLabel: string
  notes: string
  isActive: boolean
}

const EMPTY_FORM: CodeFormState = {
  code: '',
  planSlug: '6_months',
  maxRedemptions: 1,
  membershipExpiresAt: '',
  expiresAt: '',
  isReusable: false,
  memberLabel: '',
  notes: '',
  isActive: true,
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export default function AdminEnrollmentCodesPage() {
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null)
  const [invite, setInvite] = useState({ code: '', name: '', email: '' })
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteResult, setInviteResult] = useState<{
    link: string
    emailSent: boolean
    emailError?: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState<CodeFormState>(EMPTY_FORM)

  const load = async () => {
    const [codesRes, emailRes] = await Promise.all([
      fetch('/api/admin/redemption-codes'),
      fetch('/api/admin/enrollment-invite'),
    ])
    const data = await codesRes.json()
    if (data.codes) setCodes(data.codes)
    const emailData = await emailRes.json().catch(() => null)
    if (typeof emailData?.emailConfigured === 'boolean') {
      setEmailConfigured(emailData.emailConfigured)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const resetCreateForm = () => {
    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditingId(null)
  }

  const startEdit = (c: CodeRow) => {
    setError('')
    setShowForm(false)
    setEditingId(c.id)
    setForm({
      code: c.code,
      planSlug: c.plan_slug,
      maxRedemptions: c.max_redemptions,
      membershipExpiresAt: toDateInput(c.membership_expires_at),
      expiresAt: toDateInput(c.expires_at),
      isReusable: c.is_reusable,
      memberLabel: c.member_label ?? '',
      notes: c.notes ?? '',
      isActive: c.is_active,
    })
  }

  const handleCreateInvite = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInviteResult(null)
    setCopied(false)
    setInviteBusy(true)
    try {
      const res = await fetch('/api/admin/enrollment-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invite),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not create invite link')
        setInviteBusy(false)
        return
      }
      setInviteResult({
        link: data.link,
        emailSent: Boolean(data.emailSent),
        emailError: data.emailError,
      })
    } catch {
      setError('Could not create invite link')
    }
    setInviteBusy(false)
  }

  const copyInviteLink = async () => {
    if (!inviteResult?.link) return
    try {
      await navigator.clipboard.writeText(inviteResult.link)
      setCopied(true)
    } catch {
      setError('Could not copy. Select the link manually.')
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/redemption-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.code,
        planSlug: form.planSlug,
        maxRedemptions: Number(form.maxRedemptions),
        membershipExpiresAt: form.membershipExpiresAt,
        expiresAt: form.expiresAt || null,
        isReusable: form.isReusable,
        memberLabel: form.memberLabel || null,
        notes: form.notes || null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Failed to create code')
      return
    }
    resetCreateForm()
    void load()
  }

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/redemption-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        code: form.code,
        planSlug: form.planSlug,
        maxRedemptions: Number(form.maxRedemptions),
        membershipExpiresAt: form.membershipExpiresAt,
        expiresAt: form.expiresAt || null,
        isReusable: form.isReusable,
        isActive: form.isActive,
        memberLabel: form.memberLabel || null,
        notes: form.notes || null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Failed to update code')
      return
    }
    setEditingId(null)
    setForm(EMPTY_FORM)
    void load()
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    setError('')
    const res = await fetch('/api/admin/redemption-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Failed to update status')
      return
    }
    void load()
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const renderCodeFields = () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}
    >
      <label>
        Exact code
        <input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
          style={s.searchInput}
          placeholder="z36"
        />
      </label>
      <label>
        Membership expires
        <input
          type="date"
          value={form.membershipExpiresAt}
          onChange={(e) => setForm({ ...form, membershipExpiresAt: e.target.value })}
          required
          style={s.searchInput}
        />
      </label>
      <label>
        Member label
        <input
          value={form.memberLabel}
          onChange={(e) => setForm({ ...form, memberLabel: e.target.value })}
          style={s.searchInput}
          placeholder="Rahul offline"
        />
      </label>
      <label>
        Plan label
        <select
          value={form.planSlug}
          onChange={(e) => setForm({ ...form, planSlug: e.target.value })}
          style={s.select}
        >
          {COACHING_PLAN_LIST.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
          {!COACHING_PLAN_LIST.some((p) => p.slug === form.planSlug) && form.planSlug ? (
            <option value={form.planSlug}>{form.planSlug}</option>
          ) : null}
        </select>
      </label>
      <label>
        Max uses
        <input
          type="number"
          min={1}
          value={form.maxRedemptions}
          onChange={(e) => setForm({ ...form, maxRedemptions: Number(e.target.value) })}
          style={s.searchInput}
        />
        <span style={{ display: 'block', color: '#888', fontSize: 12, marginTop: 4 }}>
          How many people can redeem this code (usually 1).
        </span>
      </label>
      <label>
        Code redeem-by (optional)
        <input
          type="date"
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          style={s.searchInput}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={form.isReusable}
          onChange={(e) => setForm({ ...form, isReusable: e.target.checked })}
        />
        Reusable (multiple users)
      </label>
      {editingId && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Active
        </label>
      )}
      <label>
        Notes
        <input
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          style={s.searchInput}
          placeholder="Optional admin notes"
        />
      </label>
    </div>
  )

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle('Enrollment Codes')}</h1>
        <p style={s.subtitle}>
          Create and edit exact codes for old / offline members (e.g. z36). Each code has a membership end
          date. Members enroll at <code>/enroll</code> → confirm email → set password → onboarding. If email
          is offline, generate an invite link below and WhatsApp it.
        </p>

        {emailConfigured === false && (
          <div style={{ ...s.error, marginBottom: 16 }}>
            Enrollment emails are not configured on the server (missing Resend). Use “Create invite link”
            and send it on WhatsApp until email is set up.
          </div>
        )}
        {emailConfigured === true && (
          <p style={{ color: '#86efac', fontSize: 13, marginBottom: 16 }}>
            Email delivery is configured — /enroll confirmation emails can send.
          </p>
        )}

        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              if (showForm) {
                resetCreateForm()
              } else {
                setEditingId(null)
                setForm(EMPTY_FORM)
                setShowForm(true)
              }
            }}
            style={s.primaryBtn}
          >
            {showForm ? 'Cancel' : '+ Create code'}
          </button>
          <a href="/enroll" target="_blank" rel="noreferrer" style={s.linkBtn}>
            Open /enroll →
          </a>
        </div>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={(e) => void handleCreateInvite(e)} style={{ ...s.card, marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Create invite link (WhatsApp / email)</h2>
          <p style={{ margin: '0 0 12px', color: '#aaa', fontSize: 13, lineHeight: 1.45 }}>
            Use this when the member does not receive the verification email. Copy the link and send it on
            WhatsApp. Link expires in 24 hours.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <label>
              Enrollment code
              <input
                value={invite.code}
                onChange={(e) => setInvite({ ...invite, code: e.target.value })}
                required
                style={s.searchInput}
                placeholder="z36"
                list="enrollment-code-options"
              />
              <datalist id="enrollment-code-options">
                {codes
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.code} />
                  ))}
              </datalist>
            </label>
            <label>
              Member name
              <input
                value={invite.name}
                onChange={(e) => setInvite({ ...invite, name: e.target.value })}
                required
                style={s.searchInput}
              />
            </label>
            <label>
              Member email
              <input
                type="email"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                required
                style={s.searchInput}
              />
            </label>
          </div>
          <button type="submit" disabled={inviteBusy} style={{ ...s.primaryBtn, marginTop: 12 }}>
            {inviteBusy ? 'Creating…' : 'Create invite link'}
          </button>
          {inviteResult && (
            <div style={{ marginTop: 14 }}>
              <p
                style={{
                  margin: '0 0 8px',
                  fontSize: 13,
                  color: inviteResult.emailSent ? '#86efac' : '#fbbf24',
                }}
              >
                {inviteResult.emailSent
                  ? 'Email sent. You can still copy the link as backup.'
                  : `Email not sent${inviteResult.emailError ? ` (${inviteResult.emailError})` : ''}. Copy and WhatsApp this link:`}
              </p>
              <code
                style={{
                  display: 'block',
                  padding: 12,
                  background: '#111',
                  borderRadius: 8,
                  fontSize: 12,
                  wordBreak: 'break-all',
                  color: '#ddd',
                }}
              >
                {inviteResult.link}
              </code>
              <button
                type="button"
                onClick={() => void copyInviteLink()}
                style={{ ...s.secondaryBtn, marginTop: 10 }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          )}
        </form>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} style={{ ...s.card, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Create enrollment code</h2>
            {renderCodeFields()}
            <button type="submit" disabled={saving} style={{ ...s.primaryBtn, marginTop: 12 }}>
              {saving ? 'Saving…' : 'Create enrollment code'}
            </button>
          </form>
        )}

        {editingId && (
          <form onSubmit={(e) => void handleUpdate(e)} style={{ ...s.card, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Edit enrollment code</h2>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm(EMPTY_FORM)
                }}
                style={s.secondaryBtn}
              >
                Cancel
              </button>
            </div>
            {renderCodeFields()}
            <button type="submit" disabled={saving} style={{ ...s.primaryBtn, marginTop: 12 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        )}

        {loading ? (
          <p>Loading codes...</p>
        ) : codes.length === 0 ? (
          <p style={{ color: '#888' }}>No enrollment codes yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Code</th>
                  <th style={s.th}>Member</th>
                  <th style={s.th}>Plan</th>
                  <th style={s.th}>Membership ends</th>
                  <th style={s.th}>Redeemed</th>
                  <th style={s.th}>Redeemed by</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Created</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const usages = c.redemption_usages ?? []
                  const used = Math.max(usages.length, c.max_redemptions - c.remaining_uses)
                  const full = c.remaining_uses <= 0
                  const planName =
                    COACHING_PLAN_LIST.find((p) => p.slug === c.plan_slug)?.name ?? c.plan_slug
                  return (
                    <tr key={c.id}>
                      <td style={s.td}>
                        <strong>{c.code}</strong>
                      </td>
                      <td style={s.td}>{c.member_label || c.notes || '—'}</td>
                      <td style={s.td}>{planName}</td>
                      <td style={s.td}>{formatDate(c.membership_expires_at)}</td>
                      <td style={s.td}>
                        {used}/{c.max_redemptions} used
                        <div style={{ color: full ? '#f87171' : '#86efac', fontSize: 12, marginTop: 2 }}>
                          {full ? 'Full' : `${c.remaining_uses} left`}
                        </div>
                      </td>
                      <td style={s.td}>
                        {usages.length === 0
                          ? '—'
                          : usages
                              .map((u) => u.profiles?.email || u.profiles?.name || u.user_id.slice(0, 8))
                              .join(', ')}
                      </td>
                      <td style={s.td}>{c.is_active ? 'Active' : 'Off'}</td>
                      <td style={s.td}>{formatDate(c.created_at)}</td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => startEdit(c)} style={s.secondaryBtn}>
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleActive(c.id, !c.is_active)}
                            style={s.secondaryBtn}
                          >
                            {c.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
