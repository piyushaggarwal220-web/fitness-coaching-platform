'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatInr } from '@/lib/admin/pricing'
import { formatSupportCategory, formatSupportStatus } from '@/lib/support'
import { formatDate } from '@/lib/coach-utils'
import type { PurchaseDetail } from '@/types/database'

export default function AdminPurchaseDetailPage() {
  const params = useParams()
  const purchaseId = typeof params.id === 'string' ? params.id : ''

  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [operationMessage, setOperationMessage] = useState('')
  const [operationBusy, setOperationBusy] = useState(false)
  const [noResultClaimed, setNoResultClaimed] = useState(false)
  const [evidenceSummary, setEvidenceSummary] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!purchaseId) {
        setError('Invalid purchase id.')
        setLoading(false)
        return
      }

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
  }, [purchaseId])

  const runOperation = async (action: 'refund' | 'cancel' | 'resend_setup' | 'retry_meta') => {
    if (!purchase || reason.trim().length < 8) {
      setOperationMessage('Enter an operational reason of at least 8 characters.')
      return
    }
    if ((action === 'refund' || action === 'cancel') && !window.confirm(`Confirm ${action}? This changes customer access.`)) {
      return
    }
    setOperationBusy(true)
    setOperationMessage('')
    try {
      const amountPaise =
        action === 'refund' ? Math.round(Number(refundAmount) * 100) : undefined
      const res = await fetch(`/api/admin/purchases/${purchase.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason,
          idempotencyKey: crypto.randomUUID(),
          amountPaise,
          noResultClaimed,
          evidenceSummary,
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error || 'Operation failed')
      setOperationMessage('Operation completed successfully.')
      window.location.reload()
    } catch (operationError) {
      setOperationMessage(operationError instanceof Error ? operationError.message : 'Operation failed')
    } finally {
      setOperationBusy(false)
    }
  }

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
          <h1 style={s.title}>{brandTitle('Purchase Detail')}</h1>
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
              <Info
                label="Refund Policy Acknowledged"
                value={
                  purchase.refund_policy_acknowledged_at
                    ? `${purchase.refund_policy_version || 'version unknown'} · ${formatDate(purchase.refund_policy_acknowledged_at)}`
                    : 'Not recorded'
                }
              />
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>Payment Information</h2>
              <Info label="Status" value={purchase.status} />
              <Info label="Subscription" value={purchase.subscription_status || 'active'} />
              <Info label="Refunded" value={formatInr((purchase.refunded_amount_paise ?? 0) / 100)} />
              <Info label="Meta CAPI" value={purchase.meta_purchase_status || 'not attempted'} />
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

          <div style={{ ...s.card, marginTop: 16 }}>
            <h2 style={s.cardTitle}>Payment Operations</h2>
            <p style={{ color: '#666', fontSize: 13 }}>
              Refund and cancellation require super-admin access. Every action is idempotent and audited.
            </p>
            <div style={{ padding: 12, background: '#f7f7f7', borderRadius: 8, marginBottom: 12 }}>
              <strong>Results-guarantee eligibility: {purchase.refund_eligibility.status}</strong>
              <div>
                {purchase.refund_eligibility.onTimeCount}/{purchase.refund_eligibility.dueCount} due check-ins on time
                {' '}({purchase.refund_eligibility.percentage}%); threshold {purchase.refund_eligibility.thresholdPercent}%.
              </div>
              {purchase.refund_eligibility.openWindowCount > 0 && (
                <div>{purchase.refund_eligibility.openWindowCount} submission window(s) are still open.</div>
              )}
              <div style={{ fontSize: 12, color: '#666' }}>{purchase.refund_eligibility.reason}</div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={noResultClaimed}
                onChange={(event) => setNoResultClaimed(event.target.checked)}
              />
              I reviewed the client&apos;s no-result claim and supporting evidence; this is not inferred from metrics.
            </label>
            <label style={s.infoLabel}>No-result evidence / review notes (required for refund)</label>
            <textarea
              value={evidenceSummary}
              onChange={(event) => setEvidenceSummary(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Document the client claim, evidence reviewed, dates, and reviewer conclusion."
              style={{ ...s.searchInput, width: '100%', margin: '6px 0 12px' }}
            />
            <label style={s.infoLabel}>Reason (required)</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              style={{ ...s.searchInput, width: '100%', margin: '6px 0 12px' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {!purchase.claimed_at && !purchase.user_id && purchase.status === 'captured' && (
                <button type="button" disabled={operationBusy} onClick={() => void runOperation('resend_setup')} style={s.secondaryBtn}>
                  Resend account setup
                </button>
              )}
              {purchase.meta_purchase_status !== 'sent' && purchase.status === 'captured' && (
                <button type="button" disabled={operationBusy} onClick={() => void runOperation('retry_meta')} style={s.secondaryBtn}>
                  Retry Meta Purchase
                </button>
              )}
              {purchase.status === 'captured' && (
                <>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={(purchase.amount_paise - (purchase.refunded_amount_paise ?? 0)) / 100}
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                    placeholder="Refund INR"
                    style={{ ...s.searchInput, width: 150 }}
                  />
                  <button
                    type="button"
                    disabled={
                      operationBusy ||
                      !refundAmount ||
                      purchase.refund_eligibility.status !== 'eligible' ||
                      !noResultClaimed ||
                      evidenceSummary.trim().length < 20
                    }
                    onClick={() => void runOperation('refund')}
                    style={s.secondaryBtn}
                  >
                    Issue refund
                  </button>
                  {purchase.subscription_status === 'active' && (
                    <button type="button" disabled={operationBusy} onClick={() => void runOperation('cancel')} style={s.secondaryBtn}>
                      Cancel subscription
                    </button>
                  )}
                </>
              )}
            </div>
            {operationMessage && <div style={{ marginTop: 12, fontSize: 13 }}>{operationMessage}</div>}
          </div>

          <Section title="Operation Audit" empty={purchase.payment_operations.length === 0}>
            {purchase.payment_operations.map((operation) => (
              <div key={operation.id} style={listItemStyle}>
                <strong>{operation.operation_type}</strong> · {operation.status}
                {operation.requested_amount_paise ? ` · ${formatInr(operation.requested_amount_paise / 100)}` : ''}
                <div style={{ fontSize: 12, color: '#888' }}>{operation.reason} · {formatDate(operation.created_at)}</div>
                {operation.operation_type === 'refund' && operation.eligibility_due_count != null && (
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Eligibility: {operation.eligibility_decision} · {operation.eligibility_on_time_count}/
                    {operation.eligibility_due_count} on time ({operation.eligibility_percentage ?? 0}%)
                    {' '}· No-result claim reviewed: {operation.no_result_claimed ? 'yes' : 'no'}
                  </div>
                )}
                {operation.evidence_summary && (
                  <div style={{ fontSize: 12, color: '#666' }}>Evidence: {operation.evidence_summary}</div>
                )}
                {operation.error_message && <div style={{ fontSize: 12, color: '#a33' }}>{operation.error_message}</div>}
              </div>
            ))}
          </Section>

          <Section title="Recovery Deliveries" empty={purchase.lifecycle_deliveries.length === 0}>
            {purchase.lifecycle_deliveries.map((delivery) => (
              <div key={delivery.id} style={listItemStyle}>
                <strong>{delivery.kind}</strong> · {delivery.channel} · {delivery.status}
                <div style={{ fontSize: 12, color: '#888' }}>{formatDate(delivery.sent_at || delivery.created_at)}</div>
              </div>
            ))}
          </Section>

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
