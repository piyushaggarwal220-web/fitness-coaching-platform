'use client'

import { AdminShell } from '@/components/admin/AdminShell'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { isWhatsAppConfigured } from '@/lib/notifications/whatsapp-provider'

export default function AdminNotificationsPage() {
  const whatsappReady = isWhatsAppConfigured()

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle('Notifications')}</h1>
        <p style={s.subtitle}>In-app notification system with future-ready channels.</p>

        <div style={s.statGrid}>
          <div style={s.statCard}>
            <div style={s.statLabel}>In-App</div>
            <div style={s.statValue}>Active</div>
            <div style={s.statHint}>Bell icon on client & coach navbars</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Email</div>
            <div style={s.statValue}>Ready</div>
            <div style={s.statHint}>Resend package installed — wire via notification service</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>WhatsApp</div>
            <div style={s.statValue}>{whatsappReady ? 'Configured' : 'Stub'}</div>
            <div style={s.statHint}>
              {whatsappReady
                ? 'Provider connected via WHATSAPP_API_* env vars'
                : 'Set WHATSAPP_API_URL, WHATSAPP_API_KEY, WHATSAPP_PHONE_NUMBER_ID'}
            </div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Push</div>
            <div style={s.statValue}>Ready</div>
            <div style={s.statHint}>Register push provider via notification service</div>
          </div>
        </div>

        <div style={s.card}>
          <h2 style={s.cardTitle}>Notification Types</h2>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: '#444' }}>
            <li>Plan delivered</li>
            <li>Coach replied</li>
            <li>Weekly check-in reminder</li>
            <li>Support reply</li>
            <li>Coach assignment</li>
            <li>Welcome message</li>
            <li>Progress milestone</li>
            <li>Unread chat</li>
            <li>Issue report update</li>
            <li>Plan available</li>
            <li>Missed check-in</li>
          </ul>
        </div>

        <div style={s.card}>
          <h2 style={s.cardTitle}>WhatsApp Automation (Ready)</h2>
          <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
            The notification service dispatches to registered channel providers.
            WhatsApp reminders for weekly check-in, plan available, coach replied, and missed check-in
            are configured in <code>src/lib/notifications/whatsapp-provider.ts</code>.
            Connect your WhatsApp Business API provider by setting environment variables.
          </p>
        </div>
      </div>
    </AdminShell>
  )
}
