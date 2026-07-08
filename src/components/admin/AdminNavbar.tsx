'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { getAdminNavModules } from '@/lib/admin/modules'
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
    backgroundColor: '#1a1a2e',
    padding: '14px 20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
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
    color: '#a78bfa',
    fontSize: 22,
    fontWeight: 700,
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
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    padding: '6px 10px',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  link: {
    color: 'rgba(255,255,255,0.9)',
    textDecoration: 'none',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
  },
  logoutBtn: {
    backgroundColor: '#7c3aed',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    marginLeft: 4,
  },
}
