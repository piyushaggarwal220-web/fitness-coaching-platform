'use client'

import type { CSSProperties } from 'react'
import { StorageImage } from '@/components/ui/StorageImage'
import { colors, spacing } from '@/lib/design-tokens'

export type ComparePhotoSet = {
  front?: string | null
  side?: string | null
  back?: string | null
  label: string
}

type PhotoCompareStripProps = {
  previous: ComparePhotoSet | null
  current: ComparePhotoSet | null
  /** When current photos are local File previews */
  currentPreviewUrls?: { front?: string; side?: string; back?: string }
}

const ANGLES = ['front', 'side', 'back'] as const

export function PhotoCompareStrip({ previous, current, currentPreviewUrls }: PhotoCompareStripProps) {
  if (!previous && !current && !currentPreviewUrls) return null

  return (
    <div style={styles.wrap}>
      <p style={styles.hint}>Compare last week with this week — look for shape, posture, and visible changes.</p>
      <div style={styles.grid}>
        {ANGLES.map((angle) => {
          const prevUrl = previous?.[angle] ?? null
          const nextUrl = currentPreviewUrls?.[angle] ?? current?.[angle] ?? null
          return (
            <div key={angle} style={styles.angleCol}>
              <span style={styles.angleLabel}>{angle}</span>
              <div style={styles.pair}>
                <div style={styles.frame}>
                  {prevUrl ? (
                    prevUrl.startsWith('blob:') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={prevUrl} alt={`Previous ${angle}`} style={styles.img} />
                    ) : (
                      <StorageImage bucket="checkin-photos" src={prevUrl} alt={`Previous ${angle}`} style={styles.img} />
                    )
                  ) : (
                    <span style={styles.empty}>No prior</span>
                  )}
                  <span style={styles.caption}>{previous?.label ?? 'Before'}</span>
                </div>
                <div style={styles.frame}>
                  {nextUrl ? (
                    nextUrl.startsWith('blob:') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={nextUrl} alt={`Current ${angle}`} style={styles.img} />
                    ) : (
                      <StorageImage bucket="checkin-photos" src={nextUrl} alt={`Current ${angle}`} style={styles.img} />
                    )
                  ) : (
                    <span style={styles.empty}>Add photo</span>
                  )}
                  <span style={styles.caption}>{current?.label ?? 'Now'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { marginTop: spacing[3] },
  hint: { margin: `0 0 ${spacing[3]}px`, fontSize: 13, color: colors.textMuted, lineHeight: 1.45 },
  grid: { display: 'flex', flexDirection: 'column', gap: spacing[3] },
  angleCol: { display: 'flex', flexDirection: 'column', gap: 8 },
  angleLabel: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textSecondary },
  pair: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  frame: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    minHeight: 140,
    display: 'flex',
    flexDirection: 'column',
  },
  img: { width: '100%', height: 140, objectFit: 'cover', display: 'block' },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: colors.textMuted,
    minHeight: 140,
  },
  caption: {
    fontSize: 11,
    padding: '6px 8px',
    color: colors.textSecondary,
    borderTop: `1px solid ${colors.divider}`,
  },
}
