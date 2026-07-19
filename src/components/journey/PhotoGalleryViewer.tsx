'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import { X } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { createClient } from '@/lib/supabase/client'
import { resolveProgressPhotoUrl } from '@/lib/storage/media-url'

export type GalleryPhoto = {
  url: string
  label?: string
}

export type GalleryMeta = {
  weekNumber?: number | null
  date?: string | null
  weight?: number | null
}

type PhotoGalleryViewerProps = {
  photos: GalleryPhoto[]
  initialIndex?: number
  meta?: GalleryMeta
  onClose: () => void
}

export function PhotoGalleryViewer({
  photos,
  initialIndex = 0,
  meta,
  onClose,
}: PhotoGalleryViewerProps) {
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const touchStart = useRef<{ x: number; y: number; time: number; distance: number } | null>(null)
  const lastTap = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const current = photos[index]

  useEffect(() => {
    let cancelled = false
    if (!current?.url) {
      setResolvedUrl(null)
      return
    }
    const supabase = createClient()
    void resolveProgressPhotoUrl(supabase, current.url).then((url) => {
      if (!cancelled) setResolvedUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [current?.url])

  const goNext = useCallback(() => {
    if (photos.length <= 1) return
    setIndex((i) => (i + 1) % photos.length)
    setScale(1)
  }, [photos.length])

  const goPrev = useCallback(() => {
    if (photos.length <= 1) return
    setIndex((i) => (i - 1 + photos.length) % photos.length)
    setScale(1)
  }, [photos.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, goNext, goPrev])

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
        distance: Math.hypot(dx, dy),
      }
      return
    }

    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
      distance: 0,
    }
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (!touchStart.current) return
    const touch = e.changedTouches[0]
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    const elapsed = Date.now() - touchStart.current.time

    if (scale === 1) {
      if (dy > 80 && Math.abs(dx) < 60) {
        onClose()
        touchStart.current = null
        return
      }
      if (Math.abs(dx) > 50 && Math.abs(dy) < 80 && elapsed < 400) {
        if (dx < 0) goNext()
        else goPrev()
      }
    }

    touchStart.current = null
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && touchStart.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.hypot(dx, dy)
      if (touchStart.current.distance > 0) {
        const ratio = distance / touchStart.current.distance
        setScale(Math.min(4, Math.max(1, ratio * scale)))
      }
      touchStart.current.distance = distance
    }
  }

  const handleDoubleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      setScale((s) => (s > 1 ? 1 : 2.5))
    }
    lastTap.current = now
  }

  if (!current) return null

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Photo gallery">
      <div style={styles.header}>
        <div>
          {meta?.weekNumber != null && (
            <p style={styles.metaLine}>Week {meta.weekNumber}</p>
          )}
          {meta?.date && (
            <p style={styles.metaSub}>
              {new Date(meta.date).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}
          {meta?.weight != null && (
            <p style={styles.metaWeight}>{meta.weight} kg</p>
          )}
        </div>
        <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Close gallery">
          <X size={22} color={colors.textPrimary} />
        </button>
      </div>

      <div
        ref={containerRef}
        style={styles.stage}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleDoubleTap}
      >
        {resolvedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedUrl}
            alt={current.label ?? `Photo ${index + 1}`}
            style={{
              ...styles.image,
              transform: `scale(${scale})`,
            }}
            draggable={false}
          />
        ) : (
          <div style={{ color: colors.textMuted }}>Loading…</div>
        )}
      </div>

      <div style={styles.footer}>
        {current.label && <span style={styles.label}>{current.label}</span>}
        {photos.length > 1 && (
          <span style={styles.counter}>
            {index + 1} / {photos.length}
          </span>
        )}
      </div>

      {photos.length > 1 && (
        <>
          <button type="button" style={{ ...styles.nav, left: 12 }} onClick={goPrev} aria-label="Previous photo">
            ‹
          </button>
          <button type="button" style={{ ...styles.nav, right: 12 }} onClick={goNext} aria-label="Next photo">
            ›
          </button>
        </>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    backgroundColor: '#000000',
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeIn 200ms ease-out',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 'max(16px, env(safe-area-inset-top)) 16px 12px',
    background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 100%)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  metaLine: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  metaSub: {
    margin: '4px 0 0',
    fontSize: 14,
    color: colors.textSecondary,
  },
  metaWeight: {
    margin: '4px 0 0',
    fontSize: 15,
    fontWeight: 600,
    color: colors.accent,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: '50%',
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  stage: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    touchAction: 'none',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    transition: 'transform 150ms ease-out',
    userSelect: 'none',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '12px 16px max(24px, env(safe-area-inset-bottom))',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 100%)',
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  counter: {
    fontSize: 14,
    color: colors.textMuted,
  },
  nav: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,0.12)',
    color: colors.textPrimary,
    fontSize: 28,
    cursor: 'pointer',
    zIndex: 2,
  },
}
