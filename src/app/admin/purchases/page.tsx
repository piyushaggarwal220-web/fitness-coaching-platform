'use client'

import { AdminModulePlaceholder } from '@/components/admin/AdminModulePlaceholder'
import { AdminShell } from '@/components/admin/AdminShell'
import { getAdminModuleById } from '@/lib/admin/modules'

const moduleDef = getAdminModuleById('purchases')!

export default function AdminPurchasesPage() {
  return (
    <AdminShell>
      <AdminModulePlaceholder module={moduleDef} />
    </AdminShell>
  )
}
