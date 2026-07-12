'use client';

import type { ChangeEvent, CSSProperties } from 'react';
import { coachPageStyles as styles } from '@/lib/coach-page-styles';
import type { ClientProfile, PlanFormData } from '@/types/database';

type PlanEditorProps = {
  form: PlanFormData;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  clients?: Pick<ClientProfile, 'id' | 'name' | 'email'>[];
  clientLocked?: boolean;
};

export function PlanEditor({ form, onChange, clients, clientLocked }: PlanEditorProps) {
  return (
    <div style={localStyles.wrap}>
      {clients && (
        <Field label="Client" required>
          <select
            name="client_id"
            value={form.client_id}
            onChange={onChange}
            required
            disabled={clientLocked}
            style={styles.input}
          >
            <option value="">Select client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.email || c.id}</option>
            ))}
          </select>
        </Field>
      )}

      <div style={localStyles.row}>
        <Field label="Plan title" required>
          <input type="text" name="title" value={form.title} onChange={onChange} required style={styles.input} />
        </Field>
        <Field label="Phase">
          <input type="text" name="phase" value={form.phase} onChange={onChange} placeholder="e.g. Phase 1 — Fat Loss" style={styles.input} />
        </Field>
      </div>

      <Field label="Workout plan">
        <textarea name="workout_plan" value={form.workout_plan} onChange={onChange} rows={8} style={styles.textarea} placeholder="Exercises, sets, reps, schedule..." />
      </Field>
      <Field label="Nutrition plan">
        <textarea name="nutrition_plan" value={form.nutrition_plan} onChange={onChange} rows={8} style={styles.textarea} placeholder="Meals, macros, timing..." />
      </Field>
      <Field label="Cardio plan">
        <textarea name="cardio_plan" value={form.cardio_plan} onChange={onChange} rows={5} style={styles.textarea} placeholder="Cardio type, duration, frequency..." />
      </Field>
      <Field label="Supplement plan">
        <textarea name="supplement_plan" value={form.supplement_plan} onChange={onChange} rows={4} style={styles.textarea} placeholder="Supplements, dosage, timing..." />
      </Field>
      <Field label="Coach notes">
        <textarea name="coach_notes" value={form.coach_notes} onChange={onChange} rows={4} style={styles.textarea} placeholder="Client-facing coaching message and priorities..." />
      </Field>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={localStyles.field}>
      <label style={styles.label}>{label}{required ? ' *' : ''}</label>
      {children}
    </div>
  );
}

const localStyles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 18 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
};
