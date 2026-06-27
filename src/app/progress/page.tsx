'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { authenticateClient } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/client';
import type { ProgressStats, Workout } from '@/types/database';

const supabase = createClient();

export default function Progress() {
  const router = useRouter();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<ProgressStats>({ total: 0, totalMinutes: 0, totalCalories: 0, avgDuration: 0 });

  useEffect(() => {
    const checkUser = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) {
        setLoading(false);
        return;
      }

      const { data: workoutsData, error: loadError } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', result.user.id)
        .order('created_at', { ascending: false });

      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }

      const rows = workoutsData ?? [];
      setWorkouts(rows);
      const total = rows.length;
      const totalMinutes = rows.reduce((sum, w) => sum + (Number(w.duration) || 0), 0);
      const totalCalories = rows.reduce((sum, w) => sum + (Number(w.calories) || 0), 0);
      setStats({
        total,
        totalMinutes,
        totalCalories,
        avgDuration: total > 0 ? Math.round(totalMinutes / total) : 0,
      });
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

        {error && (
          <div style={{ padding: 16, marginTop: 16, backgroundColor: '#f8d7da', color: '#721c24', borderRadius: 8 }}>
            {error}
          </div>
        )}

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
            {workouts.length === 0 ? (
              <p style={{ color: '#666' }}>
                No workouts logged yet.{' '}
                <button
                  type="button"
                  onClick={() => router.push('/workouts')}
                  style={{ background: 'none', border: 'none', color: '#e94560', cursor: 'pointer', textDecoration: 'underline', padding: 0, font: 'inherit' }}
                >
                  Log your first workout
                </button>
              </p>
            ) : (
              workouts.slice(0, 7).map((w) => (
                <div key={w.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{new Date(w.date ?? w.created_at).toLocaleDateString()}</div>
                  <div style={{ backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ backgroundColor: '#e94560', padding: 8, color: 'white', fontSize: 12, borderRadius: 8, textAlign: 'center', width: `${Math.min((Number(w.duration) / 60) * 100, 100)}%` }}>
                      {w.duration}min - {w.name}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
