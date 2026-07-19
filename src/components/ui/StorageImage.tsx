'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveProgressPhotoUrl, resolveStorageUrl } from '@/lib/storage/media-url'

type StorageImageProps = {
  bucket?: string
  /** When true, try checkin + onboarding buckets. */
  progress?: boolean
  src: string | null | undefined
  alt: string
  style?: React.CSSProperties
  className?: string
}

/** Resolves private-bucket paths / legacy public URLs into signed image URLs. */
export function StorageImage({ bucket, progress, src, alt, style, className }: StorageImageProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!src) {
      setUrl(null)
      return
    }
    const supabase = createClient()
    const resolve = progress
      ? resolveProgressPhotoUrl(supabase, src)
      : resolveStorageUrl(supabase, bucket ?? 'checkin-photos', src)

    void resolve.then((resolved) => {
      if (!cancelled) setUrl(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [bucket, progress, src])

  if (!url) {
    return (
      <div
        className={className}
        style={{
          ...style,
          backgroundColor: 'rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#71717a',
          fontSize: 12,
        }}
        aria-label={alt}
      >
        …
      </div>
    )
  }

  return <img src={url} alt={alt} style={style} className={className} />
}
