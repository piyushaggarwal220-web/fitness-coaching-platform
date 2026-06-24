'use client';

import { useEffect, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import type { Profile } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats] = useState({ workouts: 12, streak: 5, progress: 78 });

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push('/login');
        return;
      }
      setUser(data.user);
      
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      
      setProfile(profileData);
      setLoading(false);
    };
    checkUser();
  }, [router]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' }}>
          Loading...
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '30px 20px' }}>
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: 32 }}>Welcome back, {profile?.name || user?.email || 'User'}!</h1>
          <p style={{ color: '#666' }}>Here's your fitness summary for today</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 30 }}>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏋️</div>
            <h3 style={{ margin: 0 }}>{stats.workouts}</h3>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Total Workouts</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔥</div>
            <h3 style={{ margin: 0 }}>{stats.streak}</h3>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Day Streak</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📈</div>
            <h3 style={{ margin: 0 }}>{stats.progress}%</h3>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Progress</p>
          </div>
        </div>

        <div style={{ marginBottom: 30 }}>
          <h2>Quick Actions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15, marginTop: 15 }}>
            <button 
              onClick={() => router.push('/workouts')} 
              style={{ padding: 15, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
            >
              ➕ Log Workout
            </button>
            <button 
              onClick={() => router.push('/progress')} 
              style={{ padding: 15, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
            >
              📊 View Progress
            </button>
            <button 
              onClick={() => router.push('/profile')} 
              style={{ padding: 15, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
            >
              👤 Update Profile
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h2>Recent Activity</h2>
          <div style={{ marginTop: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '12px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ fontSize: 20 }}>🟢</span>
              <div>
                <p style={{ margin: 0 }}><strong>Completed workout</strong> - Upper Body</p>
                <small style={{ color: '#666' }}>2 hours ago</small>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '12px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ fontSize: 20 }}>🟡</span>
              <div>
                <p style={{ margin: 0 }}><strong>Updated profile</strong> - Fitness goal set</p>
                <small style={{ color: '#666' }}>1 day ago</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}