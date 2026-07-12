'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { COACHING_PLAN_LIST } from '@/lib/payments/plans'
import { adminStyles as s } from '@/lib/admin/styles'
import type { RedemptionCode } from '@/types/database'

export default function AdminRedemptionCodesPage() {
  const [codes, setCodes] = useState<RedemptionCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    code: '',
    planSlug: '6_months',
    durationMonths: 6,
    maxRedemptions: 1,
    expiresAt: '',
    isReusable: false,
    notes: '',
  })

  const load = async () => {
    const res = await fetch('/api/admin/redemption-codes')
    const data = await res.json()
    if (data.codes) setCodes(data.codes)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/admin/redemption-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        durationMonths: Number(form.durationMonths),
        maxRedemptions: Number(form.maxRedemptions),
        expiresAt: form.expiresAt || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to create code'); return }
    setShowForm(false)
    setForm({ code: '', planSlug: '6_months', durationMonths: 6, maxRedemptions: 1, expiresAt: '', isReusable: false, notes: '' })
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

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>Redemption Codes</h1>
        <p style={s.subtitle}>Create and manage coupon codes for customers who paid outside the platform.</p>
      <div style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => setShowForm(!showForm)} style={s.primaryBtn}>
          {showForm ? 'Cancel' : '+ Create Code'}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {showForm && (
        <form onSubmit={(e) => void handleCreate(e)} style={{ ...s.card, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label>Code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required style={s.searchInput} placeholder="LAUNCH2026" /></label>
            <label>Plan
              <select value={form.planSlug} onChange={(e) => setForm({ ...form, planSlug: e.target.value })} style={s.select}>
                {COACHING_PLAN_LIST.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </label>
            <label>Duration (months)<input type="number" min={1} value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })} style={s.searchInput} /></label>
            <label>Max redemptions<input type="number" min={1} value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: Number(e.target.value) })} style={s.searchInput} /></label>
            <label>Expiry date<input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} style={s.searchInput} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.isReusable} onChange={(e) => setForm({ ...form, isReusable: e.target.checked })} />
              Reusable (multiple users)
            </label>
            <label>Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={s.searchInput} placeholder="Optional admin notes" /></label>
          </div>
          <button type="submit" style={{ ...s.primaryBtn, marginTop: 12 }}>Create Code</button>
        </form>
      )}

      {loading ? (
        <p>Loading codes...</p>
      ) : codes.length === 0 ? (
        <p style={{ color: '#888' }}>No redemption codes yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Code</th>
                <th style={s.th}>Plan</th>
                <th style={s.th}>Duration</th>
                <th style={s.th}>Remaining</th>
                <th style={s.th}>Expires</th>
                <th style={s.th}>Active</th>
                <th style={s.th}>Notes</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id}>
                  <td style={s.td}><code>{c.code}</code></td>
                  <td style={s.td}>{c.plan_slug}</td>
                  <td style={s.td}>{c.duration_months}mo</td>
                  <td style={s.td}>{c.remaining_uses}/{c.max_redemptions}</td>
                  <td style={s.td}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—'}</td>
                  <td style={s.td}>{c.is_active ? '✅' : '❌'}</td>
                  <td style={s.td}>{c.notes ?? '—'}</td>
                  <td style={s.td}>
                    <button type="button" onClick={() => void toggleActive(c.id, !c.is_active)} style={s.linkBtn}>
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </AdminShell>
  )
}
