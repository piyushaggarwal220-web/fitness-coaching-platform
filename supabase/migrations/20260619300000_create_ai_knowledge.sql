-- AI coaching knowledge base
CREATE TABLE IF NOT EXISTS ai_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'fat_loss',
    'muscle_gain',
    'recomposition',
    'strength',
    'nutrition',
    'cardio',
    'supplements',
    'recovery',
    'checkins',
    'injuries',
    'female',
    'beginner',
    'intermediate',
    'advanced'
  )),
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_knowledge_category_idx ON ai_knowledge(category);
CREATE INDEX IF NOT EXISTS ai_knowledge_active_idx ON ai_knowledge(active);
CREATE INDEX IF NOT EXISTS ai_knowledge_category_version_idx ON ai_knowledge(category, version DESC);

ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active knowledge entries (future coach/admin UI)
CREATE POLICY "Authenticated users can read active knowledge"
  ON ai_knowledge FOR SELECT
  USING (auth.role() = 'authenticated' AND active = true);

-- Writes are performed via service role (admin client) — no public INSERT/UPDATE policies
