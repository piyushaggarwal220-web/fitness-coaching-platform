'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { UserNotification } from '@/types/database'

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    const res = await fetch('/api/notifications')
    const data = await res.json()
    if (data.notifications) setNotifications(data.notifications)
    if (data.unreadCount != null) setUnreadCount(data.unreadCount)
  }

  useEffect(() => {
    void fetchNotifications()
    const interval = setInterval(() => void fetchNotifications(), 30000)
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
        style={styles.bell}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        🔔
        {unreadCount > 0 && <span style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div style={styles.dropdown}>
          <div style={styles.header}>
            <span style={{ fontWeight: 600 }}>Notifications</span>
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
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  style={{ ...styles.item, ...(n.read_at ? {} : styles.unread) }}
                  onClick={() => { if (!n.read_at) void markRead(n.id) }}
                >
                  {n.action_url ? (
                    <Link href={n.action_url} style={styles.itemLink} onClick={() => setOpen(false)}>
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
              ))
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
  bell: { position: 'relative', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', minWidth: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#e94560', color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' },
  dropdown: { position: 'absolute', top: '100%', right: 0, width: 320, maxWidth: '90vw', backgroundColor: 'white', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 200, marginTop: 8, overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee' },
  markAll: { background: 'none', border: 'none', color: '#e94560', fontSize: 13, cursor: 'pointer' },
  list: { maxHeight: 400, overflowY: 'auto' },
  empty: { padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
  item: { padding: '12px 16px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' },
  unread: { backgroundColor: '#fff5f7' },
  itemLink: { textDecoration: 'none', color: 'inherit', display: 'block' },
  itemTitle: { fontWeight: 600, fontSize: 14, color: '#1a1a2e', marginBottom: 2 },
  itemBody: { fontSize: 13, color: '#666', lineHeight: 1.4 },
  itemTime: { fontSize: 11, color: '#aaa', marginTop: 4 },
}
