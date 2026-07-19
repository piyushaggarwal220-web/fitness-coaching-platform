'use client';

import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import {
  AiEditSectionButton,
  PlanSectionAiEditModal,
} from '@/components/coach/PlanSectionAiEditModal';
import { coachPageStyles as styles } from '@/lib/coach-page-styles';
import type { PlanSectionKind } from '@/lib/ai/edit-plan-section';
import type { ClientProfile, PlanFormData } from '@/types/database';

type PlanEditorProps = {
  form: PlanFormData;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onFormPatch?: (patch: Partial<PlanFormData>) => void;
  clients?: Pick<ClientProfile, 'id' | 'name' | 'email'>[];
  clientLocked?: boolean;
  /** When set, shows Edit with AI on workout + nutrition */
  enableAiEdit?: boolean;
  /** Open a section AI modal once on mount (e.g. from ?ai=1). */
  initialAiSection?: PlanSectionKind | null;
  onInitialAiSectionConsumed?: () => void;
};

export function PlanEditor({
  form,
  onChange,
  onFormPatch,
  clients,
  clientLocked,
  enableAiEdit = false,
  initialAiSection = null,
  onInitialAiSectionConsumed,
}: PlanEditorProps) {
  const [aiSection, setAiSection] = useState<PlanSectionKind | null>(null);
  const clientId = form.client_id?.trim() || '';
  const canAiEdit = enableAiEdit && Boolean(clientId) && Boolean(onFormPatch);

  useEffect(() => {
    if (!canAiEdit || !initialAiSection) return;
    setAiSection(initialAiSection);
    onInitialAiSectionConsumed?.();
  }, [canAiEdit, initialAiSection, onInitialAiSectionConsumed]);

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

      <Field
        label="Workout plan"
        action={
          canAiEdit ? (
            <AiEditSectionButton onClick={() => setAiSection('workout')} />
          ) : undefined
        }
      >
        <textarea name="workout_plan" value={form.workout_plan} onChange={onChange} rows={8} style={styles.textarea} placeholder="Exercises, sets, reps, schedule..." />
      </Field>
      <Field
        label="Nutrition plan"
        action={
          canAiEdit ? (
            <AiEditSectionButton onClick={() => setAiSection('nutrition')} />
          ) : undefined
        }
      >
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

      {canAiEdit && aiSection && (
        <PlanSectionAiEditModal
          section={aiSection}
          clientId={clientId}
          currentText={aiSection === 'nutrition' ? form.nutrition_plan : form.workout_plan}
          open
          onClose={() => setAiSection(null)}
          onApply={(revisedText) => {
            onFormPatch?.(
              aiSection === 'nutrition'
                ? { nutrition_plan: revisedText }
                : { workout_plan: revisedText }
            );
          }}
        />
      )}
    </div>
  );
}

function Field({
  label,
  required,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={localStyles.field}>
      <div style={localStyles.labelRow}>
        <label style={styles.label}>{label}{required ? ' *' : ''}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

const localStyles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 18 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
};
