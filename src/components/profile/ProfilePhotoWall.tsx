'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { StorageImage } from '@/components/ui/StorageImage'
import { createClient } from '@/lib/supabase/client'
import styles from '@/app/profile/profile.module.css'

const MAX_GALLERY = 6
const supabase = createClient()

type ProfilePhotoWallProps = {
  userId: string
  paths: string[]
  onChange: (paths: string[]) => void
}

export function ProfilePhotoWall({ userId, paths, onChange }: ProfilePhotoWallProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const persist = async (next: string[]) => {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ profile_gallery_paths: next, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (updateError) throw updateError
    onChange(next)
  }

  const handleUpload = async (file: File | null) => {
    if (!file || paths.length >= MAX_GALLERY) return
    setUploading(true)
    setError('')
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${userId}/gallery/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: false,
        contentType: file.type || 'image/jpeg',
      })
      if (uploadError) throw uploadError
      await persist([...paths, path])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
  }

  const handleRemove = async (path: string) => {
    setError('')
    try {
      await supabase.storage.from('avatars').remove([path])
    } catch {
      // Best-effort storage delete; still remove from profile list.
    }
    try {
      await persist(paths.filter((p) => p !== path))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove photo')
    }
  }

  const slots = Array.from({ length: MAX_GALLERY }, (_, i) => paths[i] ?? null)

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Profile photos</h2>
      <p className={styles.sectionHint}>
        Show your progress — up to {MAX_GALLERY} photos on your player card. Tap + to add, tap × to remove.
      </p>
      <div className={styles.photoGrid}>
        {slots.map((path, index) =>
          path ? (
            <div key={path} className={`${styles.photoSlot} ${styles.photoSlotFilled}`}>
              <StorageImage bucket="avatars" src={path} alt="" className={styles.photoImg} />
              <button
                type="button"
                className={styles.photoRemove}
                aria-label="Remove photo"
                onClick={() => void handleRemove(path)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <div key={`empty-${index}`} className={styles.photoSlot}>
              {index === paths.length ? (
                <button
                  type="button"
                  className={styles.photoAdd}
                  disabled={uploading || paths.length >= MAX_GALLERY}
                  onClick={() => inputRef.current?.click()}
                >
                  <ImagePlus size={22} />
                  {uploading ? 'Uploading…' : 'Add photo'}
                </button>
              ) : null}
            </div>
          )
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
      />
      {error ? <p style={{ margin: '10px 0 0', fontSize: 13, color: '#f87171' }}>{error}</p> : null}
    </section>
  )
}
