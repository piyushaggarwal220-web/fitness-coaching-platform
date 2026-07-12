'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { isDevToolkitEnabledClient } from '@/lib/dev-mode';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { mobileNavStyles } from '@/lib/mobile-styles';
import { colors, spacing } from '@/lib/design-tokens';

const supabase = createClient();

export default function CoachNavbar() {
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
          <Link href="/coach/dashboard" style={styles.logo} onClick={() => setIsOpen(false)}>Coach Portal</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {user && <NotificationBell />}
            <button type="button" className="mobile-nav-btn" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          <div className={`mobile-nav-links${isOpen ? ' open' : ''}`}>
            <Link href="/coach/dashboard" style={styles.link} onClick={() => setIsOpen(false)}>Dashboard</Link>
            <Link href="/coach/clients" style={styles.link} onClick={() => setIsOpen(false)}>Clients</Link>
            <Link href="/coach/plans" style={styles.link} onClick={() => setIsOpen(false)}>Plans</Link>
            <Link href="/coach/checkins" style={styles.link} onClick={() => setIsOpen(false)}>Check-ins</Link>
            <Link href="/coach/chat" style={styles.link} onClick={() => setIsOpen(false)}>Chat</Link>
            <Link href="/coach/support" style={styles.link} onClick={() => setIsOpen(false)}>Support</Link>
            {isDevToolkitEnabledClient() && (
              <Link href="/admin/dev-tools" style={styles.devLink} onClick={() => setIsOpen(false)}>Dev Tools</Link>
            )}
            <button type="button" onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
          </div>
        </div>
      </nav>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
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
  container: { maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  logo: { color: colors.accent, fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, textDecoration: 'none', letterSpacing: '-0.02em' },
  link: { color: colors.textPrimary, textDecoration: 'none', padding: '10px 14px', borderRadius: 12, fontSize: 15, display: 'block', fontWeight: 500 },
  logoutBtn: { backgroundColor: colors.dangerMuted, color: colors.danger, border: 'none', padding: '10px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 15, minHeight: 44, width: '100%', textAlign: 'left', fontWeight: 600 },
  devLink: { color: colors.warning, textDecoration: 'none', padding: '10px 14px', borderRadius: 12, fontSize: 15, fontWeight: 600, display: 'block' },
};
