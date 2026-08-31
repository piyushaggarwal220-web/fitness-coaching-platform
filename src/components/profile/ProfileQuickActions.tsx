'use client'

import Link from 'next/link'
import { ClipboardCheck, Flame, Map, Trophy } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import styles from '@/app/profile/profile.module.css'

const ITEMS = [
  {
    href: '/tracker',
    title: 'Daily tracker',
    sub: 'Log today',
    icon: Flame,
    color: colors.accent,
  },
  {
    href: '/checkin',
    title: 'Check-in',
    sub: 'Weekly update',
    icon: ClipboardCheck,
    color: '#22c55e',
  },
  {
    href: '/journey',
    title: 'Journey',
    sub: 'Progress timeline',
    icon: Map,
    color: '#38bdf8',
  },
  {
    href: '/league',
    title: 'League',
    sub: 'Climb the ladder',
    icon: Trophy,
    color: '#facc15',
  },
] as const

export function ProfileQuickActions() {
  return (
    <div className={styles.actions}>
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={styles.action}>
          <span className={styles.actionIcon} style={{ backgroundColor: `${item.color}22`, color: item.color }}>
            <item.icon size={18} />
          </span>
          <span>
            <p className={styles.actionTitle}>{item.title}</p>
            <p className={styles.actionSub}>{item.sub}</p>
          </span>
        </Link>
      ))}
    </div>
  )
}
