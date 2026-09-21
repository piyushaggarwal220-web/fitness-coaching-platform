'use client'

import { useRef } from 'react'
import { Camera } from 'lucide-react'
import { StorageImage } from '@/components/ui/StorageImage'
import styles from '@/app/profile/profile.module.css'

type ProfilePlayerHeroProps = {
  name: string
  email: string
  avatarPath: string | null
  uploadingAvatar: boolean
  onAvatarPick: (file: File | null) => void
}

export function ProfilePlayerHero({
  name,
  email,
  avatarPath,
  uploadingAvatar,
  onAvatarPick,
}: ProfilePlayerHeroProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const initial = (name?.[0] ?? email?.[0] ?? 'U').toUpperCase()

  return (
    <section className={styles.hero}>
      <div className={styles.heroTop}>
        <div className={styles.avatarWrap}>
          <div className={styles.avatarRing}>
            <button
              type="button"
              className={styles.avatarBtn}
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Upload profile photo"
            >
              {avatarPath ? (
                <StorageImage
                  bucket="avatars"
                  src={avatarPath}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                initial
              )}
            </button>
          </div>
          <span className={styles.avatarBadge} aria-hidden>
            <Camera size={14} />
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onAvatarPick(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className={styles.heroMeta}>
          <p className={styles.eyebrow}>Your profile</p>
          <h1 className={styles.playerName}>{name || 'Athlete'}</h1>
          <p className={styles.playerEmail}>{email}</p>
        </div>
      </div>
    </section>
  )
}
