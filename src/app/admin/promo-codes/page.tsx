'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatInrFromPaise, promoKindLabel } from '@/lib/payments/checkout-discounts'
import type { PromoCode, PromoCodeKind, PromoDiscountType } from '@/types/database'

type CodeFormState = {
  code: string
  kind: PromoCodeKind
  discountType: PromoDiscountType
  discountInr: string
  discountPercent: string
  plan3Inr: string
  plan6Inr: string
  plan12Inr: string
  firstTimerOnly: boolean
  maxRedemptions: number
  expiresAt: string
  referrerLabel: string
  notes: string
  isActive: boolean
}

const EMPTY_FORM: CodeFormState = {
  code: '',
  kind: 'discount',
  discountType: 'fixed',
  discountInr: '200',
  discountPercent: '10',
  plan3Inr: '200',
  plan6Inr: '300',
  plan12Inr: '400',
  firstTimerOnly: false,
  maxRedemptions: 100,
  expiresAt: '',
  referrerLabel: '',
  notes: '',
  isActive: true,
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function inrToPaise(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100)
}

function paiseToInrInput(paise: number | null | undefined): string {
  if (!paise) return ''
  return String(Math.round(paise / 100))
}

function describeDiscount(code: PromoCode): string {
  if (code.discount_type === 'percent') return `${code.discount_percent}% off`
  if (code.discount_type === 'fixed') return `${formatInrFromPaise(code.discount_paise)} off`
  const parts = Object.entries(code.plan_discounts_paise ?? {}).map(
    ([slug, paise]) => `${slug.replace('_', ' ')}: ${formatInrFromPaise(Number(paise))}`
  )
  return parts.length ? parts.join(' · ') : 'Per-plan'
}

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CodeFormState>(EMPTY_FORM)
  const [filter, setFilter] = useState<'all' | PromoCodeKind>('all')

  const load = async () => {
    const res = await fetch('/api/admin/promo-codes')
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to load promo codes.')
      setLoading(false)
      return
    }
    setCodes(data.codes ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const visibleCodes = useMemo(() => {
    if (filter === 'all') return codes
    return codes.filter((c) => c.kind === filter)
  }, [codes, filter])

  const resetCreateForm = () => {
    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditingId(null)
  }

  const startEdit = (c: PromoCode) => {
    setError('')
    setShowForm(false)
    setEditingId(c.id)
    setForm({
      code: c.code,
      kind: c.kind,
      discountType: c.discount_type,
      discountInr: paiseToInrInput(c.discount_paise) || '200',
      discountPercent: String(c.discount_percent || 10),
      plan3Inr: paiseToInrInput(c.plan_discounts_paise?.['3_months']) || '200',
      plan6Inr: paiseToInrInput(c.plan_discounts_paise?.['6_months']) || '300',
      plan12Inr: paiseToInrInput(c.plan_discounts_paise?.['12_months']) || '400',
      firstTimerOnly: c.first_timer_only,
      maxRedemptions: c.max_redemptions,
      expiresAt: toDateInput(c.expires_at),
      referrerLabel: c.referrer_label ?? '',
      notes: c.notes ?? '',
      isActive: c.is_active,
    })
  }

  const buildPayload = () => {
    const planDiscountsPaise = {
      '3_months': inrToPaise(form.plan3Inr),
      '6_months': inrToPaise(form.plan6Inr),
      '12_months': inrToPaise(form.plan12Inr),
    }
    return {
      code: form.code,
      kind: form.kind,
      discountType: form.discountType,
      discountPaise: inrToPaise(form.discountInr),
      discountPercent: Number(form.discountPercent) || 0,
      planDiscountsPaise,
      firstTimerOnly: form.firstTimerOnly,
      maxRedemptions: form.maxRedemptions,
      expiresAt: form.expiresAt || null,
      referrerLabel: form.referrerLabel || null,
      notes: form.notes || null,
      isActive: form.isActive,
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create code')
      resetCreateForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create code')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...buildPayload() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not update code')
      setEditingId(null)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update code')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (c: PromoCode) => {
    setError('')
    const res = await fetch('/api/admin/promo-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, isActive: !c.is_active }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Could not update status')
      return
    }
    await load()
  }

  if (loading) {
    return (
      <AdminShell>
        <div style={s.loading}>Loading promo codes…</div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle('Discount & referral codes')}</h1>
        <p style={s.subtitle}>
          Create checkout codes that reduce Razorpay price. Enrollment / membership codes stay under
          Enrollment Codes.
        </p>

        {error && <div style={s.error}>{error}</div>}

        <div style={s.toolbar}>
          <select
            style={s.select}
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">All codes</option>
            <option value="discount">Discount only</option>
            <option value="referral">Referral only</option>
          </select>
          <button
            type="button"
            style={s.primaryBtn}
            onClick={() => {
              setEditingId(null)
              setForm(EMPTY_FORM)
              setShowForm(true)
            }}
          >
            Create code
          </button>
        </div>

        {(showForm || editingId) && (
          <form
            onSubmit={editingId ? handleUpdate : handleCreate}
            style={{ ...s.card, display: 'grid', gap: 14 }}
          >
            <h2 style={s.cardTitle}>{editingId ? `Edit ${form.code}` : 'New code'}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Code
                <input
                  required
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  style={s.searchInput}
                  placeholder="SUMMER200"
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Type
                <select
                  style={s.select}
                  value={form.kind}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, kind: e.target.value as PromoCodeKind }))
                  }
                >
                  <option value="discount">Discount</option>
                  <option value="referral">Referral</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Discount style
                <select
                  style={s.select}
                  value={form.discountType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discountType: e.target.value as PromoDiscountType }))
                  }
                >
                  <option value="fixed">Fixed ₹ off</option>
                  <option value="percent">Percent off</option>
                  <option value="plan_fixed">Different ₹ by plan</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Max uses
                <input
                  type="number"
                  min={1}
                  required
                  value={form.maxRedemptions}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxRedemptions: Number(e.target.value) || 1 }))
                  }
                  style={s.searchInput}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Expires on
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  style={s.searchInput}
                />
              </label>
            </div>

            {form.discountType === 'fixed' && (
              <label style={{ display: 'grid', gap: 6, fontSize: 13, maxWidth: 220 }}>
                Discount (₹)
                <input
                  required
                  value={form.discountInr}
                  onChange={(e) => setForm((f) => ({ ...f, discountInr: e.target.value }))}
                  style={s.searchInput}
                />
              </label>
            )}

            {form.discountType === 'percent' && (
              <label style={{ display: 'grid', gap: 6, fontSize: 13, maxWidth: 220 }}>
                Percent off
                <input
                  required
                  type="number"
                  min={1}
                  max={90}
                  value={form.discountPercent}
                  onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))}
                  style={s.searchInput}
                />
              </label>
            )}

            {form.discountType === 'plan_fixed' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                  3 months (₹)
                  <input
                    value={form.plan3Inr}
                    onChange={(e) => setForm((f) => ({ ...f, plan3Inr: e.target.value }))}
                    style={s.searchInput}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                  6 months (₹)
                  <input
                    value={form.plan6Inr}
                    onChange={(e) => setForm((f) => ({ ...f, plan6Inr: e.target.value }))}
                    style={s.searchInput}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                  12 months (₹)
                  <input
                    value={form.plan12Inr}
                    onChange={(e) => setForm((f) => ({ ...f, plan12Inr: e.target.value }))}
                    style={s.searchInput}
                  />
                </label>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Referrer / partner label
                <input
                  value={form.referrerLabel}
                  onChange={(e) => setForm((f) => ({ ...f, referrerLabel: e.target.value }))}
                  style={s.searchInput}
                  placeholder="Optional — e.g. Instagram creator"
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Notes
                <input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  style={s.searchInput}
                  placeholder="Internal note"
                />
              </label>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={form.firstTimerOnly}
                onChange={(e) => setForm((f) => ({ ...f, firstTimerOnly: e.target.checked }))}
              />
              First-time customers only
            </label>

            {editingId && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Active
              </label>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" style={s.primaryBtn} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create code'}
              </button>
              <button
                type="button"
                style={s.secondaryBtn}
                onClick={resetCreateForm}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Code</th>
                <th style={s.th}>Kind</th>
                <th style={s.th}>Discount</th>
                <th style={s.th}>Uses left</th>
                <th style={s.th}>Rules</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleCodes.length === 0 ? (
                <tr>
                  <td style={s.td} colSpan={7}>
                    No promo codes yet. Create a discount or referral code to use at checkout.
                  </td>
                </tr>
              ) : (
                visibleCodes.map((c) => (
                  <tr key={c.id}>
                    <td style={s.td}>
                      <strong>{c.code}</strong>
                      {c.referrer_label ? (
                        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{c.referrer_label}</div>
                      ) : null}
                    </td>
                    <td style={s.td}>{promoKindLabel(c.kind)}</td>
                    <td style={s.td}>{describeDiscount(c)}</td>
                    <td style={s.td}>
                      {c.remaining_uses} / {c.max_redemptions}
                    </td>
                    <td style={s.td}>
                      {c.first_timer_only ? 'First-timer · ' : ''}
                      {c.expires_at ? `Expires ${toDateInput(c.expires_at)}` : 'No expiry'}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, ...(c.is_active ? s.badgeOk : s.badgeMuted) }}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button type="button" style={s.linkBtn} onClick={() => startEdit(c)}>
                          Edit
                        </button>
                        <button type="button" style={s.linkBtn} onClick={() => void toggleActive(c)}>
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  )
}
