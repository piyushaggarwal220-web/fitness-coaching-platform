'use client'

import { useRef, type CSSProperties, type ChangeEvent } from 'react'
import { Camera, Images } from 'lucide-react'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { PHOTO_INPUT_ACCEPT } from '@/lib/photo'

type PhotoSourceControlProps = {
  label: string
  onFiles: (files: File[]) => void
  multiple?: boolean
  required?: boolean
  selectedText?: string
  disabled?: boolean
}

export function PhotoSourceControl({
  label,
  onFiles,
  multiple = false,
  required = false,
  selectedText,
  disabled = false,
}: PhotoSourceControlProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) onFiles(files)
    event.target.value = ''
  }

  return (
    <fieldset style={styles.fieldset} disabled={disabled}>
      <legend style={styles.legend}>{label}{required ? ' *' : ''}</legend>
      <div style={styles.actions}>
        <button
          type="button"
          style={styles.action}
          aria-label={`${label}: choose from gallery`}
          onClick={() => galleryInputRef.current?.click()}
        >
          <Images size={18} aria-hidden="true" />
          Choose from gallery
        </button>
        <input
          ref={galleryInputRef}
          type="file"
          accept={PHOTO_INPUT_ACCEPT}
          multiple={multiple}
          tabIndex={-1}
          onChange={handleChange}
          style={styles.visuallyHidden}
        />

        <button
          type="button"
          style={styles.action}
          aria-label={`${label}: take photo now`}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera size={18} aria-hidden="true" />
          Take photo now
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept={PHOTO_INPUT_ACCEPT}
          capture="environment"
          tabIndex={-1}
          onChange={handleChange}
          style={styles.visuallyHidden}
        />
      </div>
      {selectedText && <p style={styles.selected} aria-live="polite">{selectedText}</p>}
    </fieldset>
  )
}

const styles: Record<string, CSSProperties> = {
  fieldset: { border: 0, padding: 0, margin: 0, minWidth: 0 },
  legend: { padding: 0, marginBottom: spacing[1], fontSize: 14, fontWeight: 600, color: colors.textSecondary },
  actions: { display: 'grid', gap: 8 },
  action: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    padding: '9px 12px',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
    fontFamily: 'inherit',
  },
  selected: { margin: '8px 0 0', fontSize: 12, color: colors.success, overflowWrap: 'anywhere' },
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
}
