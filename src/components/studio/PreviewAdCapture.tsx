'use client'

import { useEffect } from 'react'
import {
  PREVIEW_AD_PATH,
  PREVIEW_DROPOFF_SECTIONS,
  type PreviewAdPath,
} from '@/lib/analytics/ad-landing'
import { trackFunnelStep } from '@/lib/analytics/funnel'
import { persistMetaClickIdsFromLocation } from '@/lib/analytics/meta-attribution'
import { createClient } from '@/lib/supabase/client'

const SESSION_KEY = 'lx_drop'
const SOURCE_KEY = 'lx_drop_source'
const VIEW_KEY = 'lx_preview_view'

function sessionId() {
  const existing = sessionStorage.getItem(SESSION_KEY)
  if (existing && /^[a-zA-Z0-9]{16,64}$/.test(existing)) return existing
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const next = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  sessionStorage.setItem(SESSION_KEY, next)
  return next
}

function trafficSource() {
  const params = new URLSearchParams(window.location.search)
  const fromAd = params.has('fbclid') || [...params.keys()].some((key) => key.startsWith('utm_'))
  if (fromAd) {
    sessionStorage.setItem(SOURCE_KEY, 'ad')
    return 'ad' as const
  }
  const saved = sessionStorage.getItem(SOURCE_KEY)
  if (saved === 'ad' || saved === 'other') return saved
  sessionStorage.setItem(SOURCE_KEY, 'other')
  return 'other' as const
}

type DropoffSection = { id: string; key: string; index: number; label: string }

/** Same ad click, landing view, and scroll records the main landing page keeps. */
export function PreviewAdCapture({
  path = PREVIEW_AD_PATH,
  sections = PREVIEW_DROPOFF_SECTIONS,
  funnelSource = 'preview1',
  viewKey = VIEW_KEY,
}: {
  path?: PreviewAdPath
  sections?: readonly DropoffSection[]
  funnelSource?: string
  viewKey?: string
} = {}) {
  useEffect(() => {
    persistMetaClickIdsFromLocation()
    const traffic = trafficSource()
    if (!sessionStorage.getItem(viewKey)) {
      sessionStorage.setItem(viewKey, '1')
      trackFunnelStep('view_landing', {
        source: funnelSource,
        path,
        traffic,
      })
    }

    const sent = new Set<string>()
    const nodes = sections.flatMap((section) => {
      const node = document.getElementById(section.id)
      return node ? [[node, section] as const] : []
    })
    if (!nodes.length || !('IntersectionObserver' in window)) return

    const supabase = createClient()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const match = nodes.find(([node]) => node === entry.target)
          if (!match || sent.has(match[1].key)) continue
          sent.add(match[1].key)
          const section = match[1]
          void supabase
            .from('landing_dropoff')
            .insert({
              session_id: sessionId(),
              section_key: section.key,
              section_index: section.index,
              section_label: section.label,
              source: traffic,
              path,
            })
            .then(() => undefined, () => undefined)
        }
      },
      { threshold: 0, rootMargin: '0px 0px -25% 0px' },
    )
    for (const [node] of nodes) observer.observe(node)
    return () => observer.disconnect()
  }, [funnelSource, path, sections, viewKey])

  return null
}
