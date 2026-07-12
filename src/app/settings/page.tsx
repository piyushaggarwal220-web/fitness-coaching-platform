'use client'

import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { colors, spacing } from '@/lib/design-tokens'

export default function ClientSettingsPage() {
  const router = useRouter()

  return (
    <ClientShell title="Settings">
      <Card variant="glass">
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Account</p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
          Manage your profile and notification preferences.
        </p>
        <Button fullWidth variant="secondary" onClick={() => router.push('/profile')}>
          Edit profile
        </Button>
      </Card>
      <Card variant="elevated" style={{ marginTop: spacing[3] }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Support</p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
          Report issues or contact the coaching team.
        </p>
        <Button fullWidth onClick={() => router.push('/client/support')}>
          Contact support
        </Button>
      </Card>
    </ClientShell>
  )
}
