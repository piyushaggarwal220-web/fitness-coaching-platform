'use client';

import { useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import type { NewWorkoutForm, Workout } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Workouts() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newWorkout, setNewWorkout] = useState<NewWorkoutForm>({
    name: '',
    duration: '',
    calories: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      await loadWorkouts(user.id);
      setLoading(false);
    };
    checkUser();
  }, [router]);

  const loadWorkouts = async (userId: string) => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (data) setWorkouts(data);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNewWorkout({ ...newWorkout, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        ...newWorkout,
        calories: parseInt(newWorkout.calories) || 0,
      });

    if (!error) {
      setNewWorkout({ name: '', duration: '', calories: '', date: new Date().toISOString().split('T')[0] });
      setShowForm(false);
      await loadWorkouts(user.id);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  return (
    <>
      <Navbar />
      <div style={styles.container}>
        <div style={styles.header}>
          <h1>🏋️ Workout Tracker</h1>
          <button style={styles.addBtn} onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancel' : '+ Log Workout'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              type="text"
              name="name"
              placeholder="Workout name"
              value={newWorkout.name}
              onChange={handleChange}
              required
              style={styles.input}
            />
            <input
              type="number"
              name="duration"
              placeholder="Duration (minutes)"
              value={newWorkout.duration}
              onChange={handleChange}
              required
              style={styles.input}
            />
            <input
              type="number"
              name="calories"
              placeholder="Calories burned"
              value={newWorkout.calories}
              onChange={handleChange}
              style={styles.input}
            />
            <input
              type="date"
              name="date"
              value={newWorkout.date}
              onChange={handleChange}
              style={styles.input}
            />
            <button type="submit" style={styles.submitBtn}>Save Workout</button>
          </form>
        )}

        <div style={styles.workoutList}>
          {workouts.length === 0 ? (
            <p style={styles.empty}>No workouts logged yet. Start your fitness journey!</p>
          ) : (
            workouts.map((workout) => (
              <div key={workout.id} style={styles.workoutItem}>
                <div>
                  <h3>{workout.name}</h3>
                  <p>⏱️ {workout.duration} min • 🔥 {workout.calories || 0} cal</p>
                  <small>📅 {new Date(workout.created_at).toLocaleDateString()}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' },
  container: { maxWidth: '800px', margin: '0 auto', padding: '30px 20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
  addBtn: { padding: '12px 24px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' },
  form: { backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '12px' },
  input: { padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px' },
  submitBtn: { padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' },
  workoutList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  workoutItem: { backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' },
  empty: { textAlign: 'center', color: '#666', padding: '40px', fontSize: '18px' },
};