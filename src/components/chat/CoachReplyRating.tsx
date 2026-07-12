'use client'

import { useEffect, useState } from 'react'
import { RATING_OPTIONS } from '@/lib/coach-ratings'
import { colors } from '@/lib/design-tokens'
import type { CoachRatingValue } from '@/types/database'

type CoachReplyRatingPromptProps = {
  messageId: string
  coachId: string
}

export function CoachReplyRatingPrompt({ messageId, coachId }: CoachReplyRatingPromptProps) {
  const [rated, setRated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showComment, setShowComment] = useState(false)
  const [comment, setComment] = useState('')
  const [selectedRating, setSelectedRating] = useState<CoachRatingValue | null>(null)

  useEffect(() => {
    fetch(`/api/coach-ratings?messageId=${messageId}`).catch(() => {})
  }, [messageId])

  const submit = async (rating: CoachRatingValue) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/coach-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, coachId, rating, comment: comment || undefined }),
      })
      if (res.ok) {
        setRated(true)
        setSelectedRating(rating)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (rated) {
    return (
      <div style={styles.thanks}>
        Thanks for your feedback! {RATING_OPTIONS.find((r) => r.value === selectedRating)?.emoji}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <span style={styles.label}>How was this reply?</span>
      <div style={styles.options}>
        {RATING_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={submitting}
            onClick={() => {
              setSelectedRating(opt.value)
              if (opt.value === 'needs_improvement') {
                setShowComment(true)
              } else {
                void submit(opt.value)
              }
            }}
            style={styles.optionBtn}
          >
            {opt.emoji} {opt.label}
          </button>
        ))}
      </div>
      {showComment && selectedRating && (
        <div style={styles.commentBox}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional: tell us more..."
            style={styles.textarea}
            rows={2}
          />
          <button type="button" onClick={() => void submit(selectedRating)} disabled={submitting} style={styles.submitBtn}>
            Submit
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '8px 0', maxWidth: 320 },
  label: { fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 6 },
  options: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  optionBtn: { padding: '6px 10px', fontSize: 12, border: `1px solid ${colors.borderSubtle}`, borderRadius: 16, background: colors.bgElevated, color: colors.textPrimary, cursor: 'pointer', minHeight: 36 },
  commentBox: { marginTop: 8 },
  textarea: { width: '100%', padding: 8, border: `1px solid ${colors.borderSubtle}`, borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', backgroundColor: colors.bgElevated, color: colors.textPrimary, fontFamily: 'inherit' },
  submitBtn: { marginTop: 6, padding: '8px 16px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', minHeight: 40, fontWeight: 600 },
  thanks: { fontSize: 12, color: colors.success, padding: '4px 0' },
}
