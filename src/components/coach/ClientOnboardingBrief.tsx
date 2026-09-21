'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { PhotoGalleryViewer, type GalleryPhoto } from '@/components/journey/PhotoGalleryViewer'
import { StorageImage } from '@/components/ui/StorageImage'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import { buildReviewSections, formFromProfile, resolveProgressPhotoRefs } from '@/lib/onboarding'
import { colors, spacing, radius } from '@/lib/coach-theme'
import type { OnboardingProfile } from '@/types/database'

type ClientOnboardingBriefProps = {
  client: OnboardingProfile
}

type PhotoTile = {
  key: string
  label: string
  src: string
  progress?: boolean
  bucket?: string
}

function galleryPaths(client: OnboardingProfile): string[] {
  const raw = client.profile_gallery_paths
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
}

/** Full onboarding answers + every client-owned photo for initial plan generation. */
export function ClientOnboardingBrief({ client }: ClientOnboardingBriefProps) {
  const form = useMemo(() => formFromProfile(client), [client])
  const progressRefs = useMemo(() => resolveProgressPhotoRefs(client), [client])
  const photoUrls = useMemo(
    () => ({
      front: progressRefs.front?.path ?? null,
      side: progressRefs.side?.path ?? null,
      back: progressRefs.back?.path ?? null,
    }),
    [progressRefs]
  )
  const sections = useMemo(() => {
    const base = buildReviewSections(form, photoUrls).filter((section) => section.title !== 'Progress Photos')
    const journeyItems = [
      { label: 'Journey goal', value: client.journey_goal?.trim() || 'Not set' },
      { label: 'Journey summary', value: client.journey_summary?.trim() || 'Not set' },
      {
        label: 'Client goal details (profile)',
        value: client.client_goal_details?.trim() || 'Not set',
      },
    ]
    return [
      ...base,
      {
        title: 'Coaching journey',
        items: journeyItems,
      },
    ]
  }, [form, photoUrls, client.journey_goal, client.journey_summary, client.client_goal_details])

  const tiles = useMemo(() => {
    const list: PhotoTile[] = []
    if (client.avatar_path?.trim()) {
      list.push({
        key: 'avatar',
        label: 'Avatar',
        src: client.avatar_path.trim(),
        bucket: 'avatars',
      })
    }
    for (const ref of [progressRefs.front, progressRefs.side, progressRefs.back]) {
      if (!ref) continue
      list.push({
        key: ref.label,
        label: ref.label === 'front' ? 'Front' : ref.label === 'side' ? 'Side' : 'Back',
        src: ref.path,
        progress: ref.bucket === 'onboarding-photos',
        bucket: ref.bucket === 'avatars' ? 'avatars' : undefined,
      })
    }
    const used = new Set(
      [progressRefs.front?.path, progressRefs.side?.path, progressRefs.back?.path].filter(Boolean)
    )
    galleryPaths(client).forEach((path, index) => {
      if (used.has(path)) return
      list.push({
        key: `gallery-${index}`,
        label: `Gallery ${index + 1}`,
        src: path,
        bucket: 'avatars',
      })
    })
    return list
  }, [client, progressRefs])

  const [gallery, setGallery] = useState<{ photos: GalleryPhoto[]; index: number } | null>(null)

  const openGallery = (index: number) => {
    setGallery({
      photos: tiles.map((tile) => ({
        url: tile.src,
        label: tile.label,
        bucket: tile.progress ? undefined : tile.bucket,
      })),
      index,
    })
  }

  return (
    <div style={s.card}>
      {gallery && (
        <PhotoGalleryViewer
          photos={gallery.photos}
          initialIndex={gallery.index}
          onClose={() => setGallery(null)}
        />
      )}

      <h2 style={styles.heading}>Client intake (full)</h2>
      <p style={styles.hint}>
        Everything from onboarding, including uploaded photos. Use this before generating the first
        plan.
      </p>

      <div style={styles.photoSection}>
        <h3 style={styles.sectionTitle}>Uploaded photos</h3>
        {tiles.length === 0 ? (
          <p style={styles.muted}>No photos uploaded yet.</p>
        ) : (
          <div style={styles.photoGrid}>
            {tiles.map((tile, index) => (
              <button
                key={tile.key}
                type="button"
                style={styles.photoButton}
                onClick={() => openGallery(index)}
              >
                <StorageImage
                  progress={tile.progress}
                  bucket={tile.bucket}
                  src={tile.src}
                  alt={tile.label}
                  style={styles.photoImg}
                />
                <span style={styles.photoLabel}>{tile.label}</span>
              </button>
            ))}
          </div>
        )}
        <div style={styles.missingRow}>
          {!photoUrls.front && <span style={styles.badge}>Front missing</span>}
          {!photoUrls.side && <span style={styles.badge}>Side missing</span>}
          {!photoUrls.back && <span style={styles.badge}>Back missing</span>}
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.title} style={styles.section}>
          <h3 style={styles.sectionTitle}>{section.title}</h3>
          <div style={styles.rows}>
            {section.items.map((item) => (
              <div key={`${section.title}-${item.label}`} style={styles.row}>
                <span style={styles.label}>{item.label}</span>
                <span style={styles.value}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  heading: {
    margin: '0 0 6px 0',
    fontSize: 15,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  hint: {
    margin: '0 0 16px 0',
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 1.45,
  },
  photoSection: {
    marginBottom: spacing[4],
    paddingBottom: spacing[3],
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  section: {
    marginBottom: spacing[3],
  },
  sectionTitle: {
    margin: '0 0 8px 0',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  rows: {
    display: 'grid',
    gap: 8,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, 38%) 1fr',
    gap: 10,
    fontSize: 14,
    lineHeight: 1.45,
  },
  label: {
    color: colors.textMuted,
    fontWeight: 500,
  },
  value: {
    color: colors.textSecondary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
    gap: 10,
  },
  photoButton: {
    display: 'block',
    width: '100%',
    padding: 0,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.md,
    overflow: 'hidden',
    background: colors.bgElevated,
    cursor: 'pointer',
    textAlign: 'left',
  },
  photoImg: {
    width: '100%',
    aspectRatio: '3 / 4',
    objectFit: 'cover',
    display: 'block',
  },
  photoLabel: {
    display: 'block',
    padding: '6px 8px',
    fontSize: 12,
    fontWeight: 600,
    color: colors.textSecondary,
  },
  missingRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.12)',
    padding: '3px 8px',
    borderRadius: 999,
  },
  muted: {
    margin: 0,
    fontSize: 13,
    color: colors.textMuted,
  },
}
