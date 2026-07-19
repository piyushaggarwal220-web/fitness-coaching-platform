-- Consistency League: opt-in peer rankings within a coach roster.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS league_opt_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.league_opt_in IS
  'When true, client appears in their coach Consistency League standings';

CREATE TABLE IF NOT EXISTS public.league_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_key text NOT NULL UNIQUE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  streak_days integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'foundation',
  rank integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, client_id)
);

CREATE INDEX IF NOT EXISTS league_standings_coach_season_idx
  ON public.league_standings (coach_id, season_id, points DESC);

ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients read league seasons" ON public.league_seasons;
CREATE POLICY "Clients read league seasons"
  ON public.league_seasons FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Clients read opted-in standings for own coach" ON public.league_standings;
CREATE POLICY "Clients read opted-in standings for own coach"
  ON public.league_standings FOR SELECT
  TO authenticated
  USING (
    coach_id = (SELECT coach_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = league_standings.client_id
        AND p.league_opt_in = true
    )
  );

DROP POLICY IF EXISTS "Clients read own standings" ON public.league_standings;
CREATE POLICY "Clients read own standings"
  ON public.league_standings FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Coaches read roster standings" ON public.league_standings;
CREATE POLICY "Coaches read roster standings"
  ON public.league_standings FOR SELECT
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid())
  );
