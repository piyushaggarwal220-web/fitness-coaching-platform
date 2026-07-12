'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { getAdminNavModules } from '@/lib/admin/modules'
import { DrawerMenuButton, DrawerNav, type DrawerNavItem } from '@/components/ui/DrawerNav'
import { BRAND_ADMIN_LABEL, BRAND_NAME } from '@/lib/brand'
import { colors } from '@/lib/design-tokens'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export default function AdminNavbar() {
  const router = useRouter()
  const navLinks = getAdminNavModules()
  const [signedInAs, setSignedInAs] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadIdentity = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email, role')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return

      const label = profile?.name || profile?.email || user.email || 'Unknown'
      const role = profile?.role ?? 'unknown'
      setSignedInAs(`${label} (${role})`)
    }

    void loadIdentity()
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const drawerItems: DrawerNavItem[] = navLinks.map((link) => ({
    href: link.href,
    label: link.title,
    icon: <LayoutGrid size={18} />,
  }))

  return (
    <>
      <nav style={styles.navbar}>
        <div style={styles.container}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <DrawerMenuButton onClick={() => setDrawerOpen(true)} />
            <Link href="/admin" style={styles.logo}>
              {BRAND_ADMIN_LABEL}
            </Link>
          </div>
          <div style={styles.links}>
            {signedInAs ? <span style={styles.identity}>{signedInAs}</span> : null}
            <button type="button" onClick={() => void handleLogout()} style={styles.logoutBtn}>
              Logout
            </button>
          </div>
        </div>
      </nav>
      <DrawerNav
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={drawerItems}
        title={BRAND_ADMIN_LABEL}
        subtitle={signedInAs ?? `${BRAND_NAME} platform management`}
      />
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  navbar: {
    backgroundColor: colors.bgGlass,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    padding: '14px 20px',
    paddingTop: 'calc(14px + env(safe-area-inset-top))',
    borderBottom: `1px solid ${colors.divider}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  logo: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 800,
    textDecoration: 'none',
    letterSpacing: '-0.02em',
  },
  links: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  identity: {
    color: colors.textMuted,
    fontSize: 13,
    padding: '6px 10px',
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
  },
  logoutBtn: {
    backgroundColor: colors.bgElevated,
    color: colors.textSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    padding: '8px 16px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    minHeight: 40,
  },
}
