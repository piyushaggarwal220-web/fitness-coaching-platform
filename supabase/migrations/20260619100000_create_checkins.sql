-- Weekly check-ins table
CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  weight numeric,
  waist numeric,
  progress_photo_front text,
  progress_photo_side text,
  progress_photo_back text,
  energy_level integer CHECK (energy_level >= 1 AND energy_level <= 10),
  hunger_level integer CHECK (hunger_level >= 1 AND hunger_level <= 10),
  training_performance integer CHECK (training_performance >= 1 AND training_performance <= 10),
  adherence_score integer CHECK (adherence_score >= 1 AND adherence_score <= 10),
  notes text,
  coach_response text,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS checkins_client_id_idx ON checkins(client_id);
CREATE INDEX IF NOT EXISTS checkins_coach_id_idx ON checkins(coach_id);
CREATE INDEX IF NOT EXISTS checkins_reviewed_idx ON checkins(reviewed);
CREATE INDEX IF NOT EXISTS checkins_submitted_at_idx ON checkins(submitted_at DESC);

ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

-- Clients can insert and read their own check-ins
CREATE POLICY "Clients can insert own checkins"
  ON checkins FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can read own checkins"
  ON checkins FOR SELECT
  USING (auth.uid() = client_id);

-- Coaches can read and update check-ins for their clients
CREATE POLICY "Coaches can read assigned checkins"
  ON checkins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = checkins.coach_id
        AND coaches.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update assigned checkins"
  ON checkins FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = checkins.coach_id
        AND coaches.user_id = auth.uid()
    )
  );

-- Storage bucket for progress photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('checkin-photos', 'checkin-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Clients can upload checkin photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'checkin-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view checkin photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'checkin-photos');

CREATE POLICY "Clients can update own checkin photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'checkin-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
