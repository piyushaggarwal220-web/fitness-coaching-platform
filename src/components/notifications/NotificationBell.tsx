'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import type { UserNotification } from '@/types/database'
import { colors, radius } from '@/lib/design-tokens'
import { motionClass } from '@/lib/motion'
import { playNotificationSound, prepareNotificationSound } from '@/lib/notification-sound'
import { safeInternalPathOrNull } from '@/lib/safe-navigation'

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [open, setOpen] = useState(false)
  const [badgePop, setBadgePop] = useState(false)
  const prevUnread = useRef(0)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    const res = await fetch('/api/notifications')
    const data = await res.json()
    if (data.notifications) setNotifications(data.notifications)
    if (data.unreadCount != null) setUnreadCount(data.unreadCount)
  }

  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      setBadgePop(true)
      playNotificationSound()
      const t = setTimeout(() => setBadgePop(false), 400)
      prevUnread.current = unreadCount
      return () => clearTimeout(t)
    }
    prevUnread.current = unreadCount
  }, [unreadCount])

  useEffect(() => {
    prepareNotificationSound()
    void fetchNotifications()
    const interval = setInterval(() => void fetchNotifications(), 45000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markRead = async (id: string) => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: id }),
    })
    void fetchNotifications()
  }

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    })
    void fetchNotifications()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`btn-press ${badgePop ? motionClass.bellBounce : ''}`}
        style={styles.bell}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={22} color={colors.textSecondary} />
        {unreadCount > 0 && (
          <span className={badgePop ? motionClass.badgePop : ''} style={styles.badge}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={motionClass.dropdownEnter} style={styles.dropdown}>
          <div style={styles.header}>
            <span style={{ fontWeight: 600, color: colors.textPrimary }}>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void markAllRead()} style={styles.markAll}>
                Mark all read
              </button>
            )}
          </div>
          <div style={styles.list}>
            {notifications.length === 0 ? (
              <div style={styles.empty}>No notifications yet</div>
            ) : (
              notifications.slice(0, 20).map((n) => {
                const href = safeInternalPathOrNull(n.action_url)
                return (
                <div
                  key={n.id}
                  style={{ ...styles.item, ...(n.read_at ? {} : styles.unread) }}
                  onClick={() => { if (!n.read_at) void markRead(n.id) }}
                >
                  {href ? (
                    <Link href={href} style={styles.itemLink} onClick={() => setOpen(false)}>
                      <div style={styles.itemTitle}>{n.title}</div>
                      <div style={styles.itemBody}>{n.body}</div>
                      <div style={styles.itemTime}>{formatTime(n.created_at)}</div>
                    </Link>
                  ) : (
                    <>
                      <div style={styles.itemTitle}>{n.title}</div>
                      <div style={styles.itemBody}>{n.body}</div>
                      <div style={styles.itemTime}>{formatTime(n.created_at)}</div>
                    </>
                  )}
                </div>
              )})
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(date: string): string {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString()
}

const styles: Record<string, React.CSSProperties> = {
  bell: { position: 'relative', background: 'none', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  badge: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.accent, color: colors.textInverse, fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' },
  dropdown: { position: 'absolute', top: '100%', right: 0, width: 320, maxWidth: '90vw', backgroundColor: colors.bgCard, borderRadius: radius.md, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 200, marginTop: 8, overflow: 'hidden', border: `1px solid ${colors.borderSubtle}` },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${colors.divider}` },
  markAll: { background: 'none', border: 'none', color: colors.accent, fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  list: { maxHeight: 400, overflowY: 'auto' },
  empty: { padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: 14 },
  item: { padding: '12px 16px', borderBottom: `1px solid ${colors.divider}`, cursor: 'pointer' },
  unread: { backgroundColor: colors.accentMuted },
  itemLink: { textDecoration: 'none', color: 'inherit', display: 'block' },
  itemTitle: { fontWeight: 600, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
  itemBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 1.4 },
  itemTime: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
}
