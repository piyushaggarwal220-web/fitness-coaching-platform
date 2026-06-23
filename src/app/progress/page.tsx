'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Progress() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, totalMinutes: 0, totalCalories: 0, avgDuration: 0 });

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push('/login');
        return;
      }
      setUser(data.user);

      const { data: workoutsData } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', data.user.id);

      if (workoutsData) {
        setWorkouts(workoutsData);
        const total = workoutsData.length;
        const totalMinutes = workoutsData.reduce((sum, w) => sum + (w.duration || 0), 0);
        const totalCalories = workoutsData.reduce((sum, w) => sum + (w.calories || 0), 0);
        setStats({
          total,
          totalMinutes,
          totalCalories,
          avgDuration: total > 0 ? Math.round(totalMinutes / total) : 0,
        });
      }
      setLoading(false);
    };
    checkUser();
  }, [router]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 20 }}>Loading...</div>;
  }

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 20px' }}>
        <h1>📊 Progress Overview</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, margin: '30px 0' }}>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <h2 style={{ margin: 0, color: '#e94560' }}>{stats.total}</h2>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Total Workouts</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <h2 style={{ margin: 0, color: '#e94560' }}>{stats.totalMinutes}</h2>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Minutes Exercised</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <h2 style={{ margin: 0, color: '#e94560' }}>{stats.totalCalories}</h2>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Calories Burned</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <h2 style={{ margin: 0, color: '#e94560' }}>{stats.avgDuration} min</h2>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Avg Workout</p>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginTop: 20 }}>
          <h2>Recent Workouts</h2>
          <div style={{ marginTop: 20 }}>
            {workouts.slice(0, 7).reverse().map((w, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{new Date(w.created_at).toLocaleDateString()}</div>
                <div style={{ backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#e94560', padding: 8, color: 'white', fontSize: 12, borderRadius: 8, textAlign: 'center', width: `${Math.min((w.duration / 60) * 100, 100)}%` }}>
                    {w.duration}min - {w.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}