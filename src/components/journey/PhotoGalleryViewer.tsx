'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { createClient } from '@/lib/supabase/client'
import { resolveProgressPhotoUrl, resolveStorageUrl } from '@/lib/storage/media-url'

export type GalleryPhoto = {
  url: string
  label?: string
  /** Storage bucket when not a progress/check-in photo. */
  bucket?: string
  /** Already-signed URL from a visible thumbnail — shown immediately. */
  previewUrl?: string
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
  /** Default bucket for photos that omit `photo.bucket` (e.g. chat-images). */
  bucket?: string
  onClose: () => void
}

export function PhotoGalleryViewer({
  photos,
  initialIndex = 0,
  meta,
  bucket,
  onClose,
}: PhotoGalleryViewerProps) {
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(
    () => photos[initialIndex]?.previewUrl ?? null
  )
  const [loadError, setLoadError] = useState('')
  const [mounted, setMounted] = useState(false)
  const touchStart = useRef<{ x: number; y: number; time: number; distance: number } | null>(null)
  const lastTap = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const current = photos[index]

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!current?.url) {
      setResolvedUrl(null)
      setLoadError('No photo available.')
      return
    }

    // Show thumbnail URL immediately while we (re)sign if needed.
    if (current.previewUrl) {
      setResolvedUrl(current.previewUrl)
    } else if (current.url.startsWith('https://') || current.url.startsWith('blob:')) {
      setResolvedUrl(current.url)
    } else {
      setResolvedUrl(null)
    }
    setLoadError('')

    const supabase = createClient()
    const resolveBucket = current.bucket ?? bucket
    const resolve = resolveBucket
      ? resolveStorageUrl(supabase, resolveBucket, current.url)
      : resolveProgressPhotoUrl(supabase, current.url)

    void resolve
      .then((url) => {
        if (cancelled) return
        if (url) {
          setResolvedUrl(url)
          setLoadError('')
        } else if (!current.previewUrl && !current.url.startsWith('https://')) {
          setLoadError('Could not load this photo.')
        }
      })
      .catch(() => {
        if (!cancelled && !current.previewUrl) {
          setLoadError('Could not load this photo.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [current?.url, current?.bucket, current?.previewUrl, bucket])

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
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
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

  if (!current || !mounted) return null

  const overlay = (
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
          <X size={22} color="#fafafa" />
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
            onError={() => {
              setLoadError('Could not display this photo.')
              setResolvedUrl(null)
            }}
          />
        ) : (
          <div style={styles.status}>
            {loadError || 'Loading…'}
          </div>
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

  return createPortal(overlay, document.body)
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100dvh',
    zIndex: 100000,
    backgroundColor: '#000000',
    display: 'flex',
    flexDirection: 'column',
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
    color: '#fafafa',
  },
  metaSub: {
    margin: '4px 0 0',
    fontSize: 14,
    color: '#c4c4cc',
  },
  metaWeight: {
    margin: '4px 0 0',
    fontSize: 15,
    fontWeight: 600,
    color: colors.accent,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.15)',
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
    minHeight: 0,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    touchAction: 'none',
    padding: '72px 16px 80px',
    boxSizing: 'border-box',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    transition: 'transform 150ms ease-out',
    userSelect: 'none',
    display: 'block',
  },
  status: {
    color: '#fafafa',
    fontSize: 15,
    fontWeight: 600,
    textAlign: 'center',
    padding: 24,
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
    zIndex: 2,
  },
  label: {
    fontSize: 14,
    color: '#c4c4cc',
    textTransform: 'capitalize',
  },
  counter: {
    fontSize: 14,
    color: '#a1a1aa',
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
    color: '#fafafa',
    fontSize: 28,
    cursor: 'pointer',
    zIndex: 2,
  },
}
