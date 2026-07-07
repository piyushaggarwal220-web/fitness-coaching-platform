'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { requireAdmin } from '@/lib/admin-session'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatInr } from '@/lib/admin/pricing'
import { formatSupportCategory, formatSupportStatus } from '@/lib/support'
import { formatDate } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type { PurchaseDetail } from '@/types/database'

const supabase = createClient()

export default function AdminPurchaseDetailPage() {
  const router = useRouter()
  const params = useParams()
  const purchaseId = typeof params.id === 'string' ? params.id : ''

  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!purchaseId) {
        setError('Invalid purchase id.')
        setLoading(false)
        return
      }

      const admin = await requireAdmin(supabase, router)
      if (!admin) return

      try {
        const res = await fetch(`/api/admin/purchases/${purchaseId}`)
        if (!res.ok) throw new Error('Not found')
        const data = (await res.json()) as { purchase: PurchaseDetail }
        setPurchase(data.purchase)
      } catch {
        setError('Purchase not found.')
      }
      setLoading(false)
    }

    void load()
  }, [purchaseId, router])

  if (loading) {
    return (
      <AdminShell>
        <div style={s.loading}>Loading purchase…</div>
      </AdminShell>
    )
  }

  if (error || !purchase) {
    return (
      <AdminShell>
        <div style={s.page}>
          <div style={s.container}>
            <Link href="/admin/purchases" style={s.backLink}>← Back to purchases</Link>
            <div style={s.errorBox}>{error || 'Purchase not found.'}</div>
          </div>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div style={s.page}>
        <div style={s.containerWide}>
          <Link href="/admin/purchases" style={s.backLink}>← Back to purchases</Link>
          <h1 style={s.title}>Purchase Detail</h1>
          <p style={s.subtitle}>{purchase.plan_name} · {formatInr(purchase.amount_paise / 100)}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={s.card}>
              <h2 style={s.cardTitle}>Customer</h2>
              <Info label="Name" value={purchase.profiles?.name || purchase.customer_name || '—'} />
              <Info label="Email" value={purchase.profiles?.email || purchase.customer_email} />
              <Info label="Onboarding" value={purchase.profiles?.onboarding_complete ? 'Complete' : 'Pending'} />
              <Info label="Plan Delivered" value={purchase.profiles?.plan_delivered ? 'Yes' : 'No'} />
              {purchase.user_id && (
                <Link href={`/admin/clients/${purchase.user_id}`} style={{ ...s.linkBtn, display: 'inline-block', marginTop: 12 }}>
                  View client profile →
                </Link>
              )}
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>Purchase Details</h2>
              <Info label="Product" value={purchase.plan_name} />
              <Info label="Plan Slug" value={purchase.plan_slug} />
              <Info label="Amount" value={formatInr(purchase.amount_paise / 100)} />
              <Info label="Currency" value={purchase.currency} />
              <Info label="Purchase Date" value={formatDate(purchase.created_at)} />
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>Payment Information</h2>
              <Info label="Status" value={purchase.status} />
              <Info label="Razorpay Order ID" value={purchase.razorpay_order_id} />
              <Info label="Razorpay Payment ID" value={purchase.razorpay_payment_id} />
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>Assigned Coach</h2>
              <Info label="Coach" value={purchase.coach?.name || 'Not assigned'} />
              {purchase.coach?.id && (
                <Link href={`/admin/coaches/${purchase.coach.id}`} style={{ ...s.linkBtn, display: 'inline-block', marginTop: 12 }}>
                  View coach →
                </Link>
              )}
            </div>
          </div>

          <Section title="Generated Plans" empty={purchase.plans.length === 0}>
            {purchase.plans.map((plan) => (
              <div key={plan.id} style={listItemStyle}>
                <strong>{plan.title}</strong> · v{plan.version} · {plan.active ? 'Active' : 'Draft'}
                <div style={{ fontSize: 12, color: '#888' }}>Updated {formatDate(plan.updated_at)}</div>
              </div>
            ))}
          </Section>

          <Section title="Support History" empty={purchase.support_requests.length === 0}>
            {purchase.support_requests.map((req) => (
              <div key={req.id} style={listItemStyle}>
                <Link href={`/admin/support/${req.id}`} style={s.linkBtn}>{req.title}</Link>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {formatSupportCategory(req.category)} · {formatSupportStatus(req.status)} · {formatDate(req.created_at)}
                </div>
              </div>
            ))}
          </Section>

          <Section title="Check-in History" empty={purchase.checkins.length === 0}>
            {purchase.checkins.map((checkin) => (
              <div key={checkin.id} style={listItemStyle}>
                <div>Weight: {checkin.weight ?? '—'} kg · Adherence: {checkin.adherence_score ?? '—'}/10</div>
                <div style={{ fontSize: 12, color: '#888' }}>{formatDate(checkin.submitted_at)}</div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </AdminShell>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={s.infoLabel}>{label}</div>
      <div style={{ ...s.infoValue, wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div style={{ ...s.card, marginTop: 16 }}>
      <h2 style={s.cardTitle}>{title}</h2>
      {empty ? <p style={{ margin: 0, color: '#666', fontSize: 14 }}>No records yet.</p> : children}
    </div>
  )
}

const listItemStyle: CSSProperties = {
  padding: '12px 0',
  borderBottom: '1px solid #f0f0f0',
  fontSize: 14,
}
