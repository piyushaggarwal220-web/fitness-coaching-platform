'use client';

import { useState, useEffect } from 'react';
import { type User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
      <style>{`
        .nav-links { display: flex; gap: 20px; align-items: center; }
        .nav-mobile-btn { display: none; font-size: 28px; background: none; border: none; color: white; cursor: pointer; }
        @media (max-width: 767px) {
          .nav-links { display: none; flex-direction: column; width: 100%; margin-top: 15px; gap: 10px; align-items: stretch; }
          .nav-links.open { display: flex; }
          .nav-mobile-btn { display: block; }
        }
      `}</style>
      <nav style={styles.navbar}>
        <div style={styles.container}>
          <Link href="/" style={styles.logo}>💪 Fitness Coach</Link>
          <button type="button" className="nav-mobile-btn" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">☰</button>
          <div className={`nav-links${isOpen ? ' open' : ''}`}>
            {user ? (
              <>
                <Link href="/dashboard" style={styles.link} onClick={() => setIsOpen(false)}>Dashboard</Link>
                <Link href="/plan" style={styles.link} onClick={() => setIsOpen(false)}>My Plan</Link>
                <Link href="/checkin" style={styles.link} onClick={() => setIsOpen(false)}>Check-In</Link>
                <Link href="/profile" style={styles.link} onClick={() => setIsOpen(false)}>Profile</Link>
                <Link href="/workouts" style={styles.link} onClick={() => setIsOpen(false)}>Workouts</Link>
                <Link href="/progress" style={styles.link} onClick={() => setIsOpen(false)}>Progress</Link>
                <Link href="/client/support" style={styles.link} onClick={() => setIsOpen(false)}>Support</Link>
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
    padding: '15px 20px',
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
    fontSize: 24,
    fontWeight: 'bold',
    textDecoration: 'none',
  },
  link: {
    color: 'white',
    textDecoration: 'none',
    padding: '8px 15px',
    borderRadius: 5,
    fontSize: 16,
  },
  logoutBtn: {
    backgroundColor: '#e94560',
    color: 'white',
    border: 'none',
    padding: '8px 20px',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 16,
  },
};
