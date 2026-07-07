'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { requireAdmin } from '@/lib/admin-session'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatDate } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type { AiGenerationLogWithRelations } from '@/types/database'

const supabase = createClient()

type DetailResponse = {
  log: AiGenerationLogWithRelations
  debugMode: boolean
}

function JsonBlock({ value }: { value: unknown }) {
  if (value == null) {
    return <p style={{ margin: 0, color: '#666', fontSize: 14 }}>Not stored (DEBUG_AI was off during generation).</p>
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: 14,
        backgroundColor: '#f8f9fb',
        borderRadius: 8,
        fontSize: 12,
        overflow: 'auto',
        maxHeight: 420,
        border: '1px solid #eee',
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function AdminAiLogDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''

  const [log, setLog] = useState<AiGenerationLogWithRelations | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('Invalid log id.')
        setLoading(false)
        return
      }

      setError('')
      const admin = await requireAdmin(supabase, router)
      if (!admin) return

      try {
        const res = await fetch(`/api/admin/ai-logs/${id}`)
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          setError(body.error || 'Failed to load log detail.')
          setLoading(false)
          return
        }

        const data = (await res.json()) as DetailResponse
        setLog(data.log)
        setDebugMode(data.debugMode)
      } catch {
        setError('Failed to load log detail.')
      }

      setLoading(false)
    }

    void load()
  }, [id, router])

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading log detail…</div>
      </>
    )
  }

  if (error || !log) {
    return (
      <>
        <AdminNavbar />
        <div style={s.page}>
          <div style={s.container}>
            <div style={s.errorBox}>{error || 'Log not found.'}</div>
            <Link href="/admin/ai-logs" style={s.backLink}>
              ← Back to AI logs
            </Link>
          </div>
        </div>
      </>
    )
  }

  const knowledgeRefs = Array.isArray(log.knowledge_refs) ? log.knowledge_refs : []

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.container}>
          <Link href="/admin/ai-logs" style={s.backLink}>
            ← Back to AI logs
          </Link>
          <h1 style={s.title}>AI Generation Log</h1>
          <p style={s.subtitle}>Generation ID: {log.id}</p>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Metadata</h2>
            <div style={s.infoGrid}>
              <MetaRow label="Time" value={formatDate(log.created_at)} />
              <MetaRow label="Client" value={log.profiles?.name || log.profiles?.email || '—'} />
              <MetaRow label="Coach" value={log.coaches?.name || '—'} />
              <MetaRow label="Action" value={log.action} />
              <MetaRow label="Model" value={log.model || '—'} />
              <MetaRow label="Prompt Version" value={log.prompt_version} />
              <MetaRow label="Latency" value={log.latency_ms != null ? `${log.latency_ms} ms` : '—'} />
              <MetaRow
                label="Tokens (prompt / completion)"
                value={`${log.prompt_tokens ?? 0} / ${log.completion_tokens ?? 0}`}
              />
              <MetaRow label="Retry Count" value={String(log.retry_count)} />
              <MetaRow label="Success" value={log.success ? 'Yes' : 'No'} />
            </div>
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Validation Result</h2>
            <p style={{ margin: 0, fontSize: 14, color: '#333', whiteSpace: 'pre-wrap' }}>
              {log.validation_result || '—'}
            </p>
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Knowledge References</h2>
            {knowledgeRefs.length === 0 ? (
              <p style={{ margin: 0, color: '#666', fontSize: 14 }}>No knowledge categories recorded.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#333' }}>
                {knowledgeRefs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            )}
          </div>

          {debugMode && (
            <>
              <div style={s.card}>
                <h2 style={s.cardTitle}>Raw JSON (DEBUG_AI)</h2>
                <JsonBlock value={log.raw_output} />
              </div>
              <div style={s.card}>
                <h2 style={s.cardTitle}>Rendered Output (DEBUG_AI)</h2>
                <JsonBlock value={log.rendered_output} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}
