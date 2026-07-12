'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { adminStyles as s } from '@/lib/admin/styles'
import { colors } from '@/lib/design-tokens'
import {
  diffPromptLines,
  formatPromptCategory,
  getPromptWithVersions,
  PROMPT_CATEGORIES,
} from '@/lib/admin/prompt-library'
import { formatDate } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type {
  PromptLibraryCategory,
  PromptLibraryVersion,
  PromptLibraryWithVersions,
  Profile,
} from '@/types/database'

const supabase = createClient()

type Tab = 'editor' | 'history' | 'compare' | 'test'

type PreviewResult = {
  preview: string
  characterCount: number
  estimatedTokens: number
  version: number
  versionId: string
  versionStatus: string
}

export default function AdminPromptDetailPage() {
  const params = useParams()
  const promptId = typeof params.id === 'string' ? params.id : ''

  const [prompt, setPrompt] = useState<PromptLibraryWithVersions | null>(null)
  const [tab, setTab] = useState<Tab>('editor')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [name, setName] = useState('')
  const [category, setCategory] = useState<PromptLibraryCategory>('system_prompt')
  const [description, setDescription] = useState('')
  const [promptBody, setPromptBody] = useState('')

  const [compareLeftId, setCompareLeftId] = useState('')
  const [compareRightId, setCompareRightId] = useState('')

  const [clients, setClients] = useState<Pick<Profile, 'id' | 'name' | 'email'>[]>([])
  const [testClientId, setTestClientId] = useState('')
  const [testVersionId, setTestVersionId] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)

  const loadPrompt = useCallback(async () => {
    if (!promptId) return
    const result = await getPromptWithVersions(supabase, promptId)
    if (result.error || !result.data) {
      setError(result.error ?? 'Prompt not found.')
      setLoading(false)
      return
    }

    const data = result.data
    setPrompt(data)
    setName(data.name)
    setCategory(data.category)
    setDescription(data.description ?? '')
    setPromptBody(data.draft_version?.prompt_body ?? data.published_version?.prompt_body ?? '')

    setCompareLeftId((prev) => prev || data.published_version?.id || data.versions[data.versions.length - 1]?.id || '')
    setCompareRightId((prev) => prev || data.draft_version?.id || data.versions[0]?.id || '')
    setTestVersionId((prev) => prev || data.draft_version?.id || data.published_version?.id || '')

    setLoading(false)
  }, [promptId])

  useEffect(() => {
    const init = async () => {
      if (!promptId) {
        setError('Invalid prompt id.')
        setLoading(false)
        return
      }

      setError('')

      const { data: clientRows } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('role', 'client')
        .order('name', { ascending: true })
        .limit(50)

      setClients((clientRows as Pick<Profile, 'id' | 'name' | 'email'>[]) ?? [])
      await loadPrompt()
    }

    void init()
  }, [promptId, loadPrompt])

  const compareVersions = useMemo(() => {
    if (!prompt) return { left: null, right: null, diff: null }
    const left = prompt.versions.find((v) => v.id === compareLeftId) ?? null
    const right = prompt.versions.find((v) => v.id === compareRightId) ?? null
    const diff = left && right ? diffPromptLines(left.prompt_body, right.prompt_body) : null
    return { left, right, diff }
  }, [prompt, compareLeftId, compareRightId])

  const runAction = async (action: string, extra?: Record<string, string>) => {
    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/admin/prompts/${promptId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Action failed.')
        setBusy(false)
        return
      }
      setSuccess('Saved.')
      setLoading(true)
      await loadPrompt()
      setLoading(false)
    } catch {
      setError('Action failed.')
    }

    setBusy(false)
  }

  const handleSaveDraft = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/admin/prompts/${promptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          description,
          prompt_body: promptBody,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to save draft.')
        setBusy(false)
        return
      }
      setSuccess('Draft saved.')
      await loadPrompt()
    } catch {
      setError('Failed to save draft.')
    }

    setBusy(false)
  }

  const handlePreview = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/prompts/${promptId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: testVersionId || undefined,
          clientId: testClientId || undefined,
        }),
      })
      const data = (await res.json()) as PreviewResult & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Preview failed.')
        setBusy(false)
        return
      }
      setPreview(data)
    } catch {
      setError('Preview failed.')
    }
    setBusy(false)
  }

  if (loading) {
    return (
      <AdminShell>
        <div style={s.loading}>Loading prompt…</div>
      </AdminShell>
    )
  }

  if (!prompt) {
    return (
      <AdminShell>
        <div style={s.page}>
          <div style={s.container}>
            <Link href="/admin/prompts" style={s.backLink}>
              ← Back to prompt library
            </Link>
            <div style={s.errorBox}>{error || 'Prompt not found.'}</div>
          </div>
        </div>
      </AdminShell>
    )
  }

  const isArchived = Boolean(prompt.archived_at)
  const canEdit = Boolean(prompt.draft_version) && !isArchived

  return (
    <AdminShell>
      <div style={s.page}>
        <div style={s.containerWide}>
          <Link href="/admin/prompts" style={s.backLink}>
            ← Back to prompt library
          </Link>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={s.title}>{prompt.name}</h1>
              <p style={s.subtitle}>
                {formatPromptCategory(prompt.category)} · {prompt.slug}
                {isArchived && ' · Archived'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!isArchived && !prompt.draft_version && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction('create_draft')}
                  style={s.secondaryBtn}
                >
                  Create draft
                </button>
              )}
              {!isArchived && prompt.draft_version && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction('publish')}
                  style={s.primaryBtn}
                >
                  Publish draft
                </button>
              )}
              {!isArchived && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction('archive')}
                  style={s.secondaryBtn}
                >
                  Archive
                </button>
              )}
            </div>
          </div>

          {error && <div style={s.error}>{error}</div>}
          {success && (
            <div style={{ ...s.error, backgroundColor: '#ecfdf5', color: '#065f46' }}>{success}</div>
          )}

          <div style={tabRowStyle}>
            {(['editor', 'history', 'compare', 'test'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={tab === t ? tabActiveStyle : tabStyle}
              >
                {t === 'editor' ? 'Editor' : t === 'history' ? 'Version history' : t === 'compare' ? 'Compare' : 'Test preview'}
              </button>
            ))}
          </div>

          {tab === 'editor' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div style={s.card}>
                <h2 style={s.cardTitle}>Prompt information</h2>
                <div style={s.infoGrid}>
                  <InfoRow label="Published version" value={prompt.published_version ? `v${prompt.published_version.version}` : '—'} />
                  <InfoRow label="Draft version" value={prompt.draft_version ? `v${prompt.draft_version.version}` : '—'} />
                  <InfoRow label="Created" value={formatDate(prompt.created_at)} />
                  <InfoRow label="Updated" value={formatDate(prompt.updated_at)} />
                </div>
                {prompt.description && (
                  <p style={{ marginTop: 16, fontSize: 14, color: '#555' }}>{prompt.description}</p>
                )}
              </div>

              <form onSubmit={(e) => void handleSaveDraft(e)} style={{ ...s.card, gridColumn: '1 / -1' }}>
                <h2 style={s.cardTitle}>Draft editor</h2>
                {!canEdit ? (
                  <p style={{ color: '#666', fontSize: 14 }}>
                    {isArchived
                      ? 'This prompt is archived.'
                      : 'No draft exists. Create a draft to edit this prompt.'}
                  </p>
                ) : (
                  <>
                    <label style={fieldLabel}>
                      Name
                      <input value={name} onChange={(e) => setName(e.target.value)} style={s.searchInput} />
                    </label>
                    <label style={fieldLabel}>
                      Category
                      <select value={category} onChange={(e) => setCategory(e.target.value as PromptLibraryCategory)} style={s.select}>
                        {PROMPT_CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={fieldLabel}>
                      Description
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={textareaStyle} rows={2} />
                    </label>
                    <label style={fieldLabel}>
                      Prompt body
                      <textarea value={promptBody} onChange={(e) => setPromptBody(e.target.value)} style={textareaStyle} rows={16} />
                    </label>
                    <button type="submit" disabled={busy} style={s.primaryBtn}>
                      {busy ? 'Saving…' : 'Save draft'}
                    </button>
                  </>
                )}
              </form>

              {prompt.published_version && (
                <div style={s.card}>
                  <h2 style={s.cardTitle}>Published version (read-only)</h2>
                  <pre style={preStyle}>{prompt.published_version.prompt_body}</pre>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div style={s.card}>
              <h2 style={s.cardTitle}>Version history</h2>
              {prompt.versions.length === 0 ? (
                <p style={{ color: '#666' }}>No versions yet.</p>
              ) : (
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Version</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}>Published</th>
                        <th style={s.th}>Updated</th>
                        <th style={s.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {prompt.versions.map((version) => (
                        <VersionRow
                          key={version.id}
                          version={version}
                          busy={busy}
                          isArchived={isArchived}
                          onRestore={() => void runAction('restore', { versionId: version.id })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'compare' && (
            <div style={s.card}>
              <h2 style={s.cardTitle}>Compare versions</h2>
              <div style={{ ...s.toolbar, marginBottom: 16 }}>
                <VersionSelect
                  label="Left version"
                  versions={prompt.versions}
                  value={compareLeftId}
                  onChange={setCompareLeftId}
                />
                <VersionSelect
                  label="Right version"
                  versions={prompt.versions}
                  value={compareRightId}
                  onChange={setCompareRightId}
                />
              </div>
              {compareVersions.diff ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <CompareColumn title={`v${compareVersions.left?.version} (${compareVersions.left?.status})`} lines={compareVersions.diff.leftLines} />
                  <CompareColumn title={`v${compareVersions.right?.version} (${compareVersions.right?.status})`} lines={compareVersions.diff.rightLines} />
                </div>
              ) : (
                <p style={{ color: '#666' }}>Select two versions to compare.</p>
              )}
            </div>
          )}

          {tab === 'test' && (
            <div style={s.card}>
              <h2 style={s.cardTitle}>Test preview</h2>
              <p style={{ fontSize: 14, color: '#666', marginTop: 0 }}>
                Preview only — does not call Anthropic or connect to live generation.
              </p>
              <div style={s.toolbar}>
                <label style={fieldLabel}>
                  Test client
                  <select value={testClientId} onChange={(e) => setTestClientId(e.target.value)} style={s.select}>
                    <option value="">Sample client data</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name || client.email || client.id}
                      </option>
                    ))}
                  </select>
                </label>
                <VersionSelect
                  label="Prompt version"
                  versions={prompt.versions}
                  value={testVersionId}
                  onChange={setTestVersionId}
                />
                <button type="button" disabled={busy} onClick={() => void handlePreview()} style={s.primaryBtn}>
                  Generate preview
                </button>
              </div>

              {preview && (
                <>
                  <div style={{ ...s.infoGrid, marginBottom: 16 }}>
                    <InfoRow label="Version" value={`v${preview.version} (${preview.versionStatus})`} />
                    <InfoRow label="Character count" value={String(preview.characterCount)} />
                    <InfoRow label="Estimated tokens" value={String(preview.estimatedTokens)} />
                  </div>
                  <pre style={preStyle}>{preview.preview}</pre>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  )
}

function VersionRow({
  version,
  busy,
  isArchived,
  onRestore,
}: {
  version: PromptLibraryVersion
  busy: boolean
  isArchived: boolean
  onRestore: () => void
}) {
  return (
    <tr>
      <td style={s.td}>v{version.version}</td>
      <td style={s.td}>{version.status}</td>
      <td style={s.td}>{version.published_at ? formatDate(version.published_at) : '—'}</td>
      <td style={s.td}>{formatDate(version.updated_at)}</td>
      <td style={s.td}>
        {!isArchived && version.status !== 'draft' && (
          <button type="button" disabled={busy} onClick={onRestore} style={s.linkBtn}>
            Restore to draft
          </button>
        )}
      </td>
    </tr>
  )
}

function VersionSelect({
  label,
  versions,
  value,
  onChange,
}: {
  label: string
  versions: PromptLibraryVersion[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label style={fieldLabel}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={s.select}>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version} ({v.status})
          </option>
        ))}
      </select>
    </label>
  )
}

function CompareColumn({
  title,
  lines,
}: {
  title: string
  lines: { text: string; changed: boolean }[]
}) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{title}</div>
      <pre style={{ ...preStyle, margin: 0 }}>
        {lines.map((line, index) => (
          <div
            key={index}
            style={{
              backgroundColor: line.changed ? '#fff7ed' : 'transparent',
              whiteSpace: 'pre-wrap',
            }}
          >
            {line.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}

const tabRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 20,
}

const tabStyle: CSSProperties = {
  padding: '10px 16px',
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 8,
  backgroundColor: colors.bgElevated,
  color: colors.textSecondary,
  cursor: 'pointer',
  fontSize: 14,
}

const tabActiveStyle: CSSProperties = {
  ...tabStyle,
  backgroundColor: colors.accentMuted,
  color: colors.accent,
  borderColor: colors.accent,
  fontWeight: 600,
}

const fieldLabel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 16,
  fontSize: 14,
  fontWeight: 600,
  color: colors.textPrimary,
}

const textareaStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  resize: 'vertical',
  backgroundColor: colors.bgElevated,
  color: colors.textPrimary,
}

const preStyle: CSSProperties = {
  margin: 0,
  padding: 14,
  backgroundColor: colors.bgElevated,
  borderRadius: 8,
  fontSize: 12,
  overflow: 'auto',
  maxHeight: 480,
  border: `1px solid ${colors.borderSubtle}`,
  whiteSpace: 'pre-wrap',
  color: colors.textPrimary,
}
