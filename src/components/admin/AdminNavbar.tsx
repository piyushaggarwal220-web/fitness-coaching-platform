'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { getAdminNavModules } from '@/lib/admin/modules'
import { colors } from '@/lib/design-tokens'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export default function AdminNavbar() {
  const router = useRouter()
  const navLinks = getAdminNavModules()
  const [signedInAs, setSignedInAs] = useState<string | null>(null)

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

  return (
    <nav style={styles.navbar}>
      <div style={styles.container}>
        <Link href="/admin/dashboard" style={styles.logo}>
          Admin Console
        </Link>
        <div style={styles.links}>
          {signedInAs ? <span style={styles.identity}>{signedInAs}</span> : null}
          {navLinks.map((link) => (
            <Link key={link.id} href={link.href} style={styles.link} title={link.description}>
              {link.title}
            </Link>
          ))}
          <button type="button" onClick={() => void handleLogout()} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}

const styles: Record<string, CSSProperties> = {
  navbar: {
    backgroundColor: colors.bgGlass,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    padding: '14px 20px',
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
    color: colors.accent,
    fontSize: 20,
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
  link: {
    color: colors.textSecondary,
    textDecoration: 'none',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
  },
  logoutBtn: {
    backgroundColor: colors.accentMuted,
    color: colors.accent,
    border: 'none',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    marginLeft: 4,
    minHeight: 40,
  },
}
