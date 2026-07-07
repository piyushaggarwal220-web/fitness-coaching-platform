'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const navLinks = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/coaches', label: 'Coaches' },
  { href: '/admin/plans', label: 'Active Plans' },
  { href: '/admin/onboarding', label: 'Pending Onboarding' },
  { href: '/admin/settings', label: 'Settings' },
]

export default function AdminNavbar() {
  const router = useRouter()

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
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} style={styles.link}>
              {link.label}
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
