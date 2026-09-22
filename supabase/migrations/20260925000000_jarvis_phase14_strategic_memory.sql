-- Jarvis Phase 14: Deep Business Memory & Strategic Intelligence
-- Extends jarvis_memory lifecycle; adds relationships + conflicts.
-- Does NOT duplicate jarvis_memory / decisions / outcomes.

-- Allow CONFLICTED lifecycle status (text column — no enum disruption)
-- memory_status already text in Phase 3; document CONFLICTED in app layer.

CREATE TABLE IF NOT EXISTS public.jarvis_memory_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_memory_id uuid NOT NULL REFERENCES public.jarvis_memory(id) ON DELETE CASCADE,
  to_memory_id uuid NOT NULL REFERENCES public.jarvis_memory(id) ON DELETE CASCADE,
  relation_type text NOT NULL
    CHECK (relation_type IN (
      'SUPPORTS', 'CONTRADICTS', 'DERIVED_FROM', 'CAUSED_BY', 'RESULTED_IN',
      'SUPERSEDES', 'RELATED_TO', 'APPLIES_TO', 'NOT_APPLICABLE_TO'
    )),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_memory_id, to_memory_id, relation_type)
);

CREATE INDEX IF NOT EXISTS jarvis_memory_relationships_from_idx
  ON public.jarvis_memory_relationships(from_memory_id);
CREATE INDEX IF NOT EXISTS jarvis_memory_relationships_to_idx
  ON public.jarvis_memory_relationships(to_memory_id);

CREATE TABLE IF NOT EXISTS public.jarvis_memory_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_a_id uuid NOT NULL REFERENCES public.jarvis_memory(id) ON DELETE CASCADE,
  memory_b_id uuid NOT NULL REFERENCES public.jarvis_memory(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  funnel_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_a_id, memory_b_id)
);

CREATE INDEX IF NOT EXISTS jarvis_memory_conflicts_status_idx
  ON public.jarvis_memory_conflicts(status, updated_at DESC);

ALTER TABLE public.jarvis_memory_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_memory_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read jarvis_memory_relationships" ON public.jarvis_memory_relationships;
CREATE POLICY "Admins read jarvis_memory_relationships"
  ON public.jarvis_memory_relationships FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_memory_relationships" ON public.jarvis_memory_relationships;
CREATE POLICY "Admins write jarvis_memory_relationships"
  ON public.jarvis_memory_relationships FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins read jarvis_memory_conflicts" ON public.jarvis_memory_conflicts;
CREATE POLICY "Admins read jarvis_memory_conflicts"
  ON public.jarvis_memory_conflicts FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_memory_conflicts" ON public.jarvis_memory_conflicts;
CREATE POLICY "Admins write jarvis_memory_conflicts"
  ON public.jarvis_memory_conflicts FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
