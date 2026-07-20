'use client'

import { useState, type ChangeEvent, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { brandTitle } from '@/lib/brand'
import { supportStyles as s } from '@/components/support/styles'
import { authenticateClient } from '@/lib/onboarding'
import {
  INITIAL_SUPPORT_FORM,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  createSupportRequest,
  validateSupportForm,
} from '@/lib/support'
import { createClient } from '@/lib/supabase/client'
import type { SupportRequestFormData } from '@/types/database'

const supabase = createClient()

export default function ClientSupportNewPage() {
  const router = useRouter()
  const [form, setForm] = useState<SupportRequestFormData>(INITIAL_SUPPORT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const validationError = validateSupportForm(form)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError('')

    const auth = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
    if (!auth) {
      setSubmitting(false)
      return
    }

    if (!auth.profile) {
      setSubmitting(false)
      return
    }

    const { data, error: createError } = await createSupportRequest(supabase, auth.profile.id, form)
    setSubmitting(false)

    if (createError || !data) {
      setError(createError ?? 'Failed to create request.')
      return
    }

    router.push(`/client/support/${data.id}`)
  }

  return (
    <ClientShell title="New request" hideBottomNav>
      <div style={{ ...s.containerNarrow, padding: 0, maxWidth: '100%' }}>
        <Link href="/client/support" style={s.backLink}>← Back to support</Link>
        <h1 style={{ ...s.title, marginTop: 8 }}>{brandTitle('New request')}</h1>
        <p style={s.subtitle}>Describe what you need help with. Your coach will respond in the support queue.</p>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={(e) => void handleSubmit(e)} style={s.card}>
          <div>
            <label style={s.label} htmlFor="category">Category</label>
            <select id="category" name="category" value={form.category} onChange={handleChange} style={s.select}>
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={s.label} htmlFor="priority">Priority</label>
            <select id="priority" name="priority" value={form.priority} onChange={handleChange} style={s.select}>
              {SUPPORT_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={s.label} htmlFor="title">Title</label>
            <input id="title" name="title" value={form.title} onChange={handleChange} style={s.input} required />
          </div>
          <div>
            <label style={s.label} htmlFor="message">Message</label>
            <textarea id="message" name="message" value={form.message} onChange={handleChange} style={s.textarea} required />
          </div>
          <button type="submit" disabled={submitting} style={s.primaryBtn}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
      </div>
    </ClientShell>
  )
}
