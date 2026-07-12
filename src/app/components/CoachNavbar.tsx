'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { isDevToolkitEnabledClient } from '@/lib/dev-mode';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { mobileNavStyles } from '@/lib/mobile-styles';

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
          <Link href="/coach/dashboard" style={styles.logo} onClick={() => setIsOpen(false)}>🏋️ Coach Portal</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {user && <NotificationBell />}
            <button type="button" className="mobile-nav-btn" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">☰</button>
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
  navbar: { backgroundColor: '#1a1a2e', padding: '12px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 100 },
  container: { maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  logo: { color: '#e94560', fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 'bold', textDecoration: 'none' },
  link: { color: 'white', textDecoration: 'none', padding: '10px 14px', borderRadius: 5, fontSize: 16, display: 'block' },
  logoutBtn: { backgroundColor: '#e94560', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 5, cursor: 'pointer', fontSize: 16, minHeight: 44, width: '100%', textAlign: 'left' },
  devLink: { color: '#ffc107', textDecoration: 'none', padding: '10px 14px', borderRadius: 5, fontSize: 16, fontWeight: 700, display: 'block' },
};
