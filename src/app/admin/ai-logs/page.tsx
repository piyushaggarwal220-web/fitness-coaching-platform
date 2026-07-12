'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatDate } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type { AiGenerationLogWithRelations } from '@/types/database'

const supabase = createClient()

type SuccessFilter = 'all' | 'success' | 'failure'

function formatTokens(prompt: number | null, completion: number | null): string {
  if (prompt == null && completion == null) return '—'
  return `${prompt ?? 0} / ${completion ?? 0}`
}

export default function AdminAiLogsPage() {
  const [logs, setLogs] = useState<AiGenerationLogWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successFilter, setSuccessFilter] = useState<SuccessFilter>('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    const load = async () => {
      setError('')

      const { data, error: fetchError } = await supabase
        .from('ai_generation_logs')
        .select('*, profiles:client_id(name, email), coaches:coach_id(name)')
        .order('created_at', { ascending: false })
        .limit(200)

      if (fetchError) {
        setError('Failed to load AI generation logs.')
        setLoading(false)
        return
      }

      setLogs((data as AiGenerationLogWithRelations[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [])

  const models = useMemo(() => {
    const set = new Set<string>()
    for (const log of logs) {
      if (log.model) set.add(log.model)
    }
    return Array.from(set).sort()
  }, [logs])

  const actions = useMemo(() => {
    const set = new Set<string>()
    for (const log of logs) {
      if (log.action) set.add(log.action)
    }
    return Array.from(set).sort()
  }, [logs])

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (successFilter === 'success' && !log.success) return false
      if (successFilter === 'failure' && log.success) return false
      if (modelFilter !== 'all' && log.model !== modelFilter) return false
      if (actionFilter !== 'all' && log.action !== actionFilter) return false
      if (dateFilter) {
        const logDate = log.created_at.slice(0, 10)
        if (logDate !== dateFilter) return false
      }
      return true
    })
  }, [logs, successFilter, modelFilter, actionFilter, dateFilter])

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading AI logs…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>{brandTitle('AI Generation Logs')}</h1>
          <p style={s.subtitle}>Internal trace for AI generation attempts — debugging and QA.</p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.toolbar}>
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value as SuccessFilter)}
              style={s.select}
            >
              <option value="all">All outcomes</option>
              <option value="success">Success only</option>
              <option value="failure">Failure only</option>
            </select>
            <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} style={s.select}>
              <option value="all">All models</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={s.select}>
              <option value="all">All actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={s.select}
              aria-label="Filter by date"
            />
            {dateFilter && (
              <button type="button" onClick={() => setDateFilter('')} style={s.secondaryBtn}>
                Clear date
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={s.empty}>No AI generation logs match your filters.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Time</th>
                    <th style={s.th}>Client</th>
                    <th style={s.th}>Coach</th>
                    <th style={s.th}>Action</th>
                    <th style={s.th}>Model</th>
                    <th style={s.th}>Prompt Version</th>
                    <th style={s.th}>Latency</th>
                    <th style={s.th}>Tokens</th>
                    <th style={s.th}>Validation</th>
                    <th style={s.th}>Success</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id}>
                      <td style={s.td}>{formatDate(log.created_at)}</td>
                      <td style={s.td}>{log.profiles?.name || log.profiles?.email || '—'}</td>
                      <td style={s.td}>{log.coaches?.name || '—'}</td>
                      <td style={s.td}>{log.action}</td>
                      <td style={s.td}>{log.model || '—'}</td>
                      <td style={s.td}>{log.prompt_version}</td>
                      <td style={s.td}>{log.latency_ms != null ? `${log.latency_ms} ms` : '—'}</td>
                      <td style={s.td}>{formatTokens(log.prompt_tokens, log.completion_tokens)}</td>
                      <td style={s.td}>
                        <span
                          style={{
                            ...s.badge,
                            ...(log.validation_result === 'pass' ? s.badgeOk : s.badgeWarn),
                          }}
                        >
                          {log.validation_result === 'pass' ? 'pass' : 'fail'}
                        </span>
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, ...(log.success ? s.badgeOk : s.badgeWarn) }}>
                          {log.success ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={s.td}>
                        <Link href={`/admin/ai-logs/${log.id}`} style={s.linkBtn}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
