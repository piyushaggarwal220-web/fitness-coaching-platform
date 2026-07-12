'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { Dumbbell, Plus } from 'lucide-react';
import { ClientShell } from '@/components/ui/ClientShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { authenticateClient } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/client';
import { brandTitle } from '@/lib/brand';
import { colors, spacing } from '@/lib/design-tokens';
import { mobileStyles } from '@/lib/mobile-styles';
import type { NewWorkoutForm, Workout } from '@/types/database';

const supabase = createClient();

async function fetchWorkouts(userId: string) {
  const { data, error: loadError } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, loadError };
}

export default function Workouts() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [newWorkout, setNewWorkout] = useState<NewWorkoutForm>({
    name: '',
    duration: '',
    calories: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    const checkUser = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) { setLoading(false); return; }
      setUser(result.user as User);
      const { data, loadError } = await fetchWorkouts(result.user.id);
      if (loadError) setError(loadError.message);
      else if (data) setWorkouts(data);
      setLoading(false);
    };
    checkUser();
  }, [router]);

  const loadWorkouts = async (userId: string) => {
    const { data, loadError } = await fetchWorkouts(userId);
    if (loadError) setError(loadError.message);
    else if (data) setWorkouts(data);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNewWorkout({ ...newWorkout, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const { error: insertError } = await supabase.from('workouts').insert({
      user_id: user.id,
      name: newWorkout.name.trim(),
      duration: parseInt(newWorkout.duration, 10) || 0,
      calories: parseInt(newWorkout.calories, 10) || 0,
      date: newWorkout.date || null,
    });

    if (insertError) { setError(insertError.message); return; }

    setNewWorkout({ name: '', duration: '', calories: '', date: new Date().toISOString().split('T')[0] });
    setShowForm(false);
    await loadWorkouts(user.id);
  };

  if (loading) return <ClientShell title="Workouts" loading />;

  return (
    <ClientShell title="Workouts">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4], gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{brandTitle('Workouts')}</h1>
          <p style={{ margin: '4px 0 0', color: colors.textSecondary }}>Log your training sessions</p>
        </div>
        <Button size="md" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : <><Plus size={18} /> Log</>}
        </Button>
      </div>

      {error && <div style={mobileStyles.error}>{error}</div>}

      {showForm && (
        <Card variant="elevated">
          <form onSubmit={handleSubmit}>
            <Input label="Workout name" name="name" value={newWorkout.name} onChange={handleChange} required placeholder="e.g. Upper body" />
            <Input label="Duration (minutes)" type="number" name="duration" value={newWorkout.duration} onChange={handleChange} required />
            <Input label="Calories burned" type="number" name="calories" value={newWorkout.calories} onChange={handleChange} />
            <Input label="Date" type="date" name="date" value={newWorkout.date} onChange={handleChange} />
            <Button type="submit" fullWidth>Save Workout</Button>
          </form>
        </Card>
      )}

      {workouts.length === 0 ? (
        <Card variant="glass">
          <div style={{ textAlign: 'center', padding: spacing[4] }}>
            <Dumbbell size={32} color={colors.textMuted} style={{ marginBottom: 12 }} />
            <p style={{ margin: 0, color: colors.textMuted }}>No workouts logged yet. Start your fitness journey!</p>
          </div>
        </Card>
      ) : (
        workouts.map((workout) => (
          <Card key={workout.id} variant="elevated">
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>{workout.name}</h3>
            <p style={{ margin: '0 0 4px', color: colors.textSecondary, fontSize: 14 }}>
              {workout.duration} min · {workout.calories || 0} cal
            </p>
            <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>
              {new Date(workout.date ?? workout.created_at).toLocaleDateString()}
            </p>
          </Card>
        ))
      )}
    </ClientShell>
  );
}
