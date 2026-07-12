'use client';

import { useState, useEffect } from 'react';
import { type User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BRAND_NAME } from '@/lib/brand'
import { mobileNavStyles } from '@/lib/mobile-styles'
import { colors, spacing } from '@/lib/design-tokens';

const supabase = createClient();

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <>
      <style>{mobileNavStyles}</style>
      <nav style={styles.navbar}>
        <div style={styles.container}>
          <Link href="/" style={styles.logo} onClick={() => setIsOpen(false)}>{BRAND_NAME}</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {user && <NotificationBell />}
            <button type="button" className="mobile-nav-btn" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          <div className={`mobile-nav-links${isOpen ? ' open' : ''}`}>
            {user ? (
              <>
                <Link href="/dashboard" style={styles.link} onClick={() => setIsOpen(false)}>Dashboard</Link>
                <Link href="/workouts" style={styles.link} onClick={() => setIsOpen(false)}>Workouts</Link>
                <Link href="/client/support" style={styles.link} onClick={() => setIsOpen(false)}>Support</Link>
                <Link href="/client/report-issue" style={styles.link} onClick={() => setIsOpen(false)}>Report Issue</Link>
                <button type="button" onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
              </>
            ) : (
              <>
                <Link href="/login" style={styles.link} onClick={() => setIsOpen(false)}>Login</Link>
                <Link href="/checkout?plan=6_months" style={styles.link} onClick={() => setIsOpen(false)}>Get Started</Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  navbar: {
    backgroundColor: colors.bgGlass,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    padding: `${spacing[2]}px ${spacing[3]}px`,
    borderBottom: `1px solid ${colors.divider}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  logo: {
    color: colors.accent,
    fontSize: 'clamp(18px, 4vw, 22px)',
    fontWeight: 800,
    textDecoration: 'none',
    letterSpacing: '-0.02em',
  },
  link: {
    color: colors.textPrimary,
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: 12,
    fontSize: 15,
    display: 'block',
    fontWeight: 500,
  },
  logoutBtn: {
    backgroundColor: colors.dangerMuted,
    color: colors.danger,
    border: 'none',
    padding: '10px 20px',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 15,
    minHeight: 44,
    width: '100%',
    textAlign: 'left',
    fontWeight: 600,
  },
};
