'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { COACHING_PLAN_LIST } from '@/lib/payments/plans'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import type { RedemptionCode } from '@/types/database'

type CodeRow = RedemptionCode & {
  redemption_usages?: { user_id: string; redeemed_at: string; profiles?: { email: string | null; name: string | null } | null }[]
}

export default function AdminEnrollmentCodesPage() {
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    code: '',
    planSlug: '6_months',
    maxRedemptions: 1,
    membershipExpiresAt: '',
    expiresAt: '',
    isReusable: false,
    memberLabel: '',
    notes: '',
  })

  const load = async () => {
    const res = await fetch('/api/admin/redemption-codes')
    const data = await res.json()
    if (data.codes) setCodes(data.codes)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
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
    if (!res.ok) {
      setError(data.error ?? 'Failed to create code')
      return
    }
    setShowForm(false)
    setForm({
      code: '',
      planSlug: '6_months',
      maxRedemptions: 1,
      membershipExpiresAt: '',
      expiresAt: '',
      isReusable: false,
      memberLabel: '',
      notes: '',
    })
    void load()
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    await fetch('/api/admin/redemption-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    })
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

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle('Enrollment Codes')}</h1>
        <p style={s.subtitle}>
          Create exact codes for old / offline members (e.g. z36). Each code has a membership end date.
          Members enroll at <code>/enroll</code> → confirm email → set password → onboarding.
        </p>

        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setShowForm(!showForm)} style={s.primaryBtn}>
            {showForm ? 'Cancel' : '+ Create code'}
          </button>
          <a href="/enroll" target="_blank" rel="noreferrer" style={s.linkBtn}>
            Open /enroll →
          </a>
        </div>

        {error && <div style={s.error}>{error}</div>}

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} style={{ ...s.card, marginBottom: 20 }}>
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
            <button type="submit" style={{ ...s.primaryBtn, marginTop: 12 }}>
              Create enrollment code
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
                  <th style={s.th}>Membership ends</th>
                  <th style={s.th}>Uses</th>
                  <th style={s.th}>Redeemed by</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Created</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const usages = c.redemption_usages ?? []
                  return (
                    <tr key={c.id}>
                      <td style={s.td}>
                        <strong>{c.code}</strong>
                      </td>
                      <td style={s.td}>{c.member_label || c.notes || '—'}</td>
                      <td style={s.td}>{formatDate(c.membership_expires_at)}</td>
                      <td style={s.td}>
                        {c.remaining_uses}/{c.max_redemptions}
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
                        <button
                          type="button"
                          onClick={() => void toggleActive(c.id, !c.is_active)}
                          style={s.secondaryBtn}
                        >
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
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
