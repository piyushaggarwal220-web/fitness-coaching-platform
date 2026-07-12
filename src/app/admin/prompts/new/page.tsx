'use client'

import { useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { PROMPT_CATEGORIES, slugifyPromptName, validatePromptForm } from '@/lib/admin/prompt-library'
import type { PromptLibraryCategory, PromptLibraryFormData } from '@/types/database'

const INITIAL_FORM: PromptLibraryFormData = {
  name: '',
  slug: '',
  category: 'system_prompt',
  description: '',
  prompt_body: '',
}

export default function AdminNewPromptPage() {
  const router = useRouter()
  const [form, setForm] = useState<PromptLibraryFormData>(INITIAL_FORM)
  const [slugTouched, setSlugTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug: slugTouched ? prev.slug : slugifyPromptName(name),
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const validation = validatePromptForm(form)
    if (validation) {
      setError(validation)
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = (await res.json()) as { prompt?: { id: string }; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to create prompt.')
        setBusy(false)
        return
      }
      router.push(`/admin/prompts/${data.prompt!.id}`)
    } catch {
      setError('Failed to create prompt.')
      setBusy(false)
    }
  }

  return (
    <AdminShell>
      <div style={s.page}>
        <div style={s.container}>
          <Link href="/admin/prompts" style={s.backLink}>
            ← Back to prompt library
          </Link>
          <h1 style={s.title}>{brandTitle('New Prompt')}</h1>
          <p style={s.subtitle}>Creates a new prompt with version 1 as draft.</p>

          {error && <div style={s.error}>{error}</div>}

          <form onSubmit={(e) => void handleSubmit(e)} style={s.card}>
            <label style={labelStyle}>
              Name
              <input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                style={s.searchInput}
                required
              />
            </label>

            <label style={labelStyle}>
              Slug
              <input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setForm((prev) => ({ ...prev, slug: e.target.value }))
                }}
                style={s.searchInput}
                required
              />
            </label>

            <label style={labelStyle}>
              Category
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, category: e.target.value as PromptLibraryCategory }))
                }
                style={s.select}
              >
                {PROMPT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                style={textareaStyle}
                rows={3}
              />
            </label>

            <label style={labelStyle}>
              Prompt body
              <textarea
                value={form.prompt_body}
                onChange={(e) => setForm((prev) => ({ ...prev, prompt_body: e.target.value }))}
                style={textareaStyle}
                rows={14}
                required
                placeholder="Use {{client.name}}, {{client.age}}, {{client.goal}}, etc. for preview tokens."
              />
            </label>

            <button type="submit" disabled={busy} style={s.primaryBtn}>
              {busy ? 'Creating…' : 'Create draft'}
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  )
}

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 16,
  fontSize: 14,
  fontWeight: 600,
  color: '#333',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #ddd',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  resize: 'vertical',
}
