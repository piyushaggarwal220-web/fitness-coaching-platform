'use client';

import { useState, useEffect } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    <nav style={styles.navbar}>
      <div style={styles.container}>
        <Link href="/" style={styles.logo}>💪 Fitness Coach</Link>
        <button onClick={() => setIsOpen(!isOpen)} style={styles.mobileBtn}>☰</button>
        <div style={{ ...styles.links, ...(isOpen ? styles.linksOpen : {}) }}>
          {user ? (
            <>
              <Link href="/dashboard" style={styles.link}>Dashboard</Link>
              <Link href="/plan" style={styles.link}>My Plan</Link>
              <Link href="/checkin" style={styles.link}>Check-In</Link>
              <Link href="/profile" style={styles.link}>Profile</Link>
              <Link href="/workouts" style={styles.link}>Workouts</Link>
              <Link href="/progress" style={styles.link}>Progress</Link>
              <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
            </>
          ) : (
            <>
              <Link href="/login" style={styles.link}>Login</Link>
              <Link href="/signup" style={styles.link}>Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </nav>
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
  links: {
    display: 'flex',
    gap: 20,
    alignItems: 'center',
  },
  linksOpen: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    marginTop: 15,
    gap: 10,
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
  mobileBtn: {
    fontSize: 28,
    background: 'none',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    display: 'block',
  },
};