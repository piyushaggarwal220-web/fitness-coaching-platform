'use client'

import { useState, type CSSProperties, type FormEvent } from 'react'
import { PHYSIQUE_PREVIEW_PLANS, type PhysiquePreviewPlanSlug } from '@/lib/physique-preview'

const VISITOR_KEY = 'lx_physique_visitor'
const USED_KEY = 'lx_physique_used_day'

function visitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  window.localStorage.setItem(VISITOR_KEY, created)
  return created
}

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

async function fileToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const maxEdge = 1280
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read this photo.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  if (!blob) throw new Error('Could not read this photo.')
  return blob
}

export function PhysiquePreviewForm() {
  const [plan, setPlan] = useState<PhysiquePreviewPlanSlug>('6_months')
  const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usedToday, setUsedToday] = useState(false)
  const [result, setResult] = useState<{ image: string; plan: string; price: string; checkoutUrl: string } | null>(
    null
  )

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!adult) {
      setError('Confirm you are 18 or older and this photo is you.')
      return
    }
    const form = event.currentTarget
    const input = form.elements.namedItem('photo')
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined
    if (!file) {
      setError('Choose a photo first.')
      return
    }
    setBusy(true)
    try {
      const photo = await fileToJpeg(file)
      const body = new FormData()
      body.set('photo', photo, 'preview.jpg')
      body.set('plan', plan)
      body.set('adult', 'yes')
      body.set('visitorId', visitorId())
      const response = await fetch('/api/public/physique-preview', { method: 'POST', body })
      const data = (await response.json()) as {
        error?: string
        image?: string
        plan?: string
        price?: string
        checkoutUrl?: string
      }
      if (!response.ok || !data.image || !data.checkoutUrl || !data.plan || !data.price) {
        if (response.status === 429) setUsedToday(true)
        setError(data.error || 'We could not make the preview.')
        return
      }
      window.localStorage.setItem(USED_KEY, todayKey())
      setUsedToday(true)
      setResult({ image: data.image, plan: data.plan, price: data.price, checkoutUrl: data.checkoutUrl })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not make the preview.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={styles.wrap} aria-labelledby="physique-preview-title">
      <p style={styles.eyebrow}>See your plan</p>
      <h2 id="physique-preview-title" style={styles.title}>
        One preview of you
      </h2>
      <p style={styles.lede}>
        Upload one photo and pick a plan. This is an illustration of the direction that plan aims for, not a promise
        of what your body will look like.
      </p>
      {result ? (
        <div style={styles.result}>
          {/* Data URL from the preview API — not a static file the image optimizer can fetch. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.image} alt="" style={styles.image} />
          <p style={styles.caption}>
            Illustration for {result.plan} · {result.price}. Results depend on following the plan.
          </p>
          <a href={result.checkoutUrl} style={styles.cta}>
            Get {result.plan}
          </a>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={styles.form}>
          <fieldset style={styles.plans} disabled={busy || usedToday}>
            <legend style={styles.legend}>Which plan should the picture show?</legend>
            {(Object.keys(PHYSIQUE_PREVIEW_PLANS) as PhysiquePreviewPlanSlug[]).map((slug) => {
              const item = PHYSIQUE_PREVIEW_PLANS[slug]
              return (
                <label key={slug} style={styles.choice}>
                  <input
                    type="radio"
                    name="plan"
                    value={slug}
                    checked={plan === slug}
                    onChange={() => setPlan(slug)}
                  />
                  <span>
                    {item.name} · {item.price}
                  </span>
                </label>
              )
            })}
          </fieldset>
          <label style={styles.fileLabel}>
            Your photo
            <input name="photo" type="file" accept="image/*" disabled={busy || usedToday} />
          </label>
          <label style={styles.check}>
            <input
              type="checkbox"
              checked={adult}
              onChange={(event) => setAdult(event.target.checked)}
              disabled={busy || usedToday}
            />
            I am 18 or older, and this photo is me.
          </label>
          {usedToday && !busy ? <p style={styles.note}>You have already used today’s preview.</p> : null}
          {error ? <p style={styles.error}>{error}</p> : null}
          <button type="submit" disabled={busy || usedToday} style={styles.button}>
            {busy ? 'Making your preview…' : 'Show my preview'}
          </button>
        </form>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    maxWidth: 480,
    margin: '0 auto',
    padding: 24,
    color: '#f8fafc',
    fontFamily: 'system-ui, sans-serif',
  },
  eyebrow: {
    margin: 0,
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  title: { margin: '8px 0 0', fontSize: 32, lineHeight: 1.15 },
  lede: { color: '#cbd5e1', lineHeight: 1.5 },
  form: { display: 'grid', gap: 14 },
  plans: { border: 0, margin: 0, padding: 0, display: 'grid', gap: 8 },
  legend: { marginBottom: 8 },
  choice: { display: 'flex', gap: 8, alignItems: 'center' },
  fileLabel: { display: 'grid', gap: 6 },
  check: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  note: { margin: 0, color: '#fbbf24' },
  error: { margin: 0, color: '#fecaca' },
  button: {
    border: 0,
    borderRadius: 999,
    background: '#22c55e',
    color: '#052e16',
    fontWeight: 800,
    padding: '14px 18px',
  },
  result: { display: 'grid', gap: 12 },
  image: { width: '100%', borderRadius: 18, background: '#1c1917' },
  caption: { margin: 0, color: '#cbd5e1' },
  cta: {
    display: 'inline-block',
    textAlign: 'center',
    textDecoration: 'none',
    background: '#22c55e',
    color: '#052e16',
    fontWeight: 800,
    borderRadius: 999,
    padding: '14px 18px',
  },
}
