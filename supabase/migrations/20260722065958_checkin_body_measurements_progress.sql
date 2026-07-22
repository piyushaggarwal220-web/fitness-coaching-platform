-- Body girths + progress/adherence text for check-ins
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS chest numeric,
  ADD COLUMN IF NOT EXISTS thigh numeric,
  ADD COLUMN IF NOT EXISTS navel numeric,
  ADD COLUMN IF NOT EXISTS progress_rating integer,
  ADD COLUMN IF NOT EXISTS progress_notes text,
  ADD COLUMN IF NOT EXISTS adherence_wins text,
  ADD COLUMN IF NOT EXISTS adherence_struggles text;

COMMENT ON COLUMN public.checkins.chest IS 'Chest circumference in cm';
COMMENT ON COLUMN public.checkins.thigh IS 'Thigh circumference in cm';
COMMENT ON COLUMN public.checkins.navel IS 'Belly circumference at navel in cm';
COMMENT ON COLUMN public.checkins.progress_rating IS 'Client self-rated weekly progress 1-10';
COMMENT ON COLUMN public.checkins.progress_notes IS 'How progress looks/feels vs last week';
COMMENT ON COLUMN public.checkins.adherence_wins IS 'Mid-week: what helped stick to the plan';
COMMENT ON COLUMN public.checkins.adherence_struggles IS 'Mid-week: where adherence slipped';
