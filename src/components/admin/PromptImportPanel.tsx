'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminStyles as s } from '@/lib/admin/styles'
import { IMPORTABLE_PROMPT_CATEGORIES, type ImportablePromptCategory } from '@/lib/admin/prompt-import-constants'

type Verification = {
  ok: boolean
  missingCategories: ImportablePromptCategory[]
  promptCount: number
  publishedPromptCount: number
}

type PromptImportPanelProps = {
  endpoint: '/api/admin/prompts/import' | '/api/dev/prompt-import'
  onImported?: () => void
}

export function PromptImportPanel({ endpoint, onImported }: PromptImportPanelProps) {
  const [verification, setVerification] = useState<Verification | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [slug, setSlug] = useState('')
  const [category, setCategory] = useState<ImportablePromptCategory>('initial_diet')
  const [promptBody, setPromptBody] = useState('')

  const loadVerification = useCallback(async () => {
    const res = await fetch(endpoint, { method: 'GET' })
    const json = await res.json()
    if (res.ok) {
      setVerification(json.verification ?? null)
    }
  }, [endpoint])

  useEffect(() => {
    let cancelled = false

    fetch(endpoint, { method: 'GET' })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.verification) {
          setVerification(json.verification)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [endpoint])

  const runManifestImport = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const body =
        endpoint === '/api/dev/prompt-import'
          ? { action: 'manifest' }
          : { action: 'manifest' }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')

      setMessage(json.message ?? 'Import complete.')
      setVerification(json.verification ?? null)
      onImported?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const runSingleImport = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const body =
        endpoint === '/api/dev/prompt-import'
          ? { action: 'single', prompt: { slug, category, prompt_body: promptBody } }
          : { slug, category, prompt_body: promptBody }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')

      setMessage('Prompt imported as published version 1.')
      setVerification(json.verification ?? null)
      setSlug('')
      setPromptBody('')
      onImported?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={s.card}>
      <h2 style={s.cardTitle}>Import Production Prompts</h2>
      <p style={{ marginTop: 0, color: '#666', fontSize: 14, lineHeight: 1.5 }}>
        Import prompts from <code>prompts/production/manifest.json</code> or paste a single prompt.
        Bodies are stored verbatim — whitespace is preserved.
      </p>

      {verification && (
        <div style={s.infoGrid}>
          <div>
            <div style={s.infoLabel}>Prompt count</div>
            <div style={s.infoValue}>{verification.promptCount}</div>
          </div>
          <div>
            <div style={s.infoLabel}>Published</div>
            <div style={s.infoValue}>{verification.publishedPromptCount}</div>
          </div>
          <div>
            <div style={s.infoLabel}>Required categories</div>
            <div style={s.infoValue}>
              {IMPORTABLE_PROMPT_CATEGORIES.length - verification.missingCategories.length}/
              {IMPORTABLE_PROMPT_CATEGORIES.length}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" onClick={() => void runManifestImport()} disabled={busy} style={s.primaryBtn}>
          {busy ? 'Importing…' : 'Import manifest'}
        </button>
        <button type="button" onClick={() => void loadVerification()} disabled={busy} style={s.secondaryBtn}>
          Refresh status
        </button>
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #eee' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Single prompt import</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            Slug
            <input value={slug} onChange={(e) => setSlug(e.target.value)} style={s.searchInput} placeholder="initial-diet-prompt" />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as ImportablePromptCategory)} style={s.select}>
              {IMPORTABLE_PROMPT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            Prompt body
            <textarea
              value={promptBody}
              onChange={(e) => setPromptBody(e.target.value)}
              rows={10}
              style={{ ...s.searchInput, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre', minHeight: 180 }}
              placeholder="Paste prompt text exactly as authored…"
            />
          </label>
          <button
            type="button"
            onClick={() => void runSingleImport()}
            disabled={busy || !slug.trim() || promptBody.length === 0}
            style={s.secondaryBtn}
          >
            Import single prompt
          </button>
        </div>
      </div>

      {message && (
        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: 14, borderRadius: 10, marginTop: 16, fontSize: 14 }}>
          {message}
        </div>
      )}
      {error && <div style={{ ...s.error, marginTop: 16 }}>{error}</div>}
      {verification && verification.missingCategories.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#856404' }}>
          Missing published categories: {verification.missingCategories.join(', ')}
        </div>
      )}
    </div>
  )
}
