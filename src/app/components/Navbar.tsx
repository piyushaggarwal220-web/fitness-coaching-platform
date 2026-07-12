'use client';

import { useState, useEffect } from 'react';
import { type User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { mobileNavStyles } from '@/lib/mobile-styles';

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
          <Link href="/" style={styles.logo} onClick={() => setIsOpen(false)}>💪 Fitness Coach</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {user && <NotificationBell />}
            <button type="button" className="mobile-nav-btn" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">☰</button>
          </div>
          <div className={`mobile-nav-links${isOpen ? ' open' : ''}`}>
            {user ? (
              <>
                <Link href="/dashboard" style={styles.link} onClick={() => setIsOpen(false)}>Dashboard</Link>
                <Link href="/plan" style={styles.link} onClick={() => setIsOpen(false)}>My Plan</Link>
                <Link href="/checkin" style={styles.link} onClick={() => setIsOpen(false)}>Check-In</Link>
                <Link href="/journey" style={styles.link} onClick={() => setIsOpen(false)}>Journey</Link>
                <Link href="/client/chat" style={styles.link} onClick={() => setIsOpen(false)}>Need Help</Link>
                <Link href="/profile" style={styles.link} onClick={() => setIsOpen(false)}>Profile</Link>
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
    backgroundColor: '#1a1a2e',
    padding: '12px 16px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  logo: {
    color: '#e94560',
    fontSize: 'clamp(18px, 4vw, 24px)',
    fontWeight: 'bold',
    textDecoration: 'none',
  },
  link: {
    color: 'white',
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: 5,
    fontSize: 16,
    display: 'block',
  },
  logoutBtn: {
    backgroundColor: '#e94560',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 16,
    minHeight: 44,
    width: '100%',
    textAlign: 'left',
  },
};
