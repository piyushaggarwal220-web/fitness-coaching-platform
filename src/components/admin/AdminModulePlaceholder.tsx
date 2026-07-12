'use client'

import Link from 'next/link'
import { brandTitle } from '@/lib/brand'
import type { AdminModule } from '@/lib/admin/modules'
import { adminStyles as s } from '@/lib/admin/styles'

type AdminModulePlaceholderProps = {
  module: AdminModule
}

export function AdminModulePlaceholder({ module }: AdminModulePlaceholderProps) {
  return (
    <div style={s.page}>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle(module.title)}</h1>
        <p style={s.subtitle}>{module.description}</p>

        <div style={s.card}>
          <span style={{ ...s.badge, ...s.badgeWarn }}>Coming soon</span>
          <p style={{ margin: '16px 0 0 0', fontSize: 15, color: '#444', lineHeight: 1.6 }}>
            This module is scaffolded with routes and database schema. Full functionality will be
            implemented in a dedicated phase — one admin module at a time.
          </p>

          {module.tables.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={s.infoLabel}>Database tables</div>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 14, color: '#555' }}>
                {module.tables.map((table) => (
                  <li key={table}>
                    <code>{table}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Link href="/admin/dashboard" style={s.backLink}>
          ← Back to dashboard
        </Link>
      </div>
    </div>
  )
}
