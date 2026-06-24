'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function CoachNavbar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

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
        <Link href="/coach/dashboard" style={styles.logo}>🏋️ Coach Portal</Link>
        <div style={styles.links}>
          <Link href="/coach/dashboard" style={styles.link}>Dashboard</Link>
          <Link href="/coach/clients" style={styles.link}>Clients</Link>
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>
    </nav>
  );
}

const styles: Record<string, CSSProperties> = {
  navbar: { backgroundColor: '#1a1a2e', padding: '15px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 100 },
  container: { maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  logo: { color: '#e94560', fontSize: 24, fontWeight: 'bold', textDecoration: 'none' },
  links: { display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' },
  link: { color: 'white', textDecoration: 'none', padding: '8px 15px', borderRadius: 5, fontSize: 16 },
  logoutBtn: { backgroundColor: '#e94560', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 5, cursor: 'pointer', fontSize: 16 },
};