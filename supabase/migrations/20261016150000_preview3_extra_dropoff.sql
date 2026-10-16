-- Extra scroll sections on the colourful preview: truth check, expected changes, quiz.

ALTER TABLE public.landing_dropoff DROP CONSTRAINT IF EXISTS landing_dropoff_section;

ALTER TABLE public.landing_dropoff ADD CONSTRAINT landing_dropoff_section CHECK (
  (
    (section_index = 0 AND section_key = 'hero' AND section_label = 'Hero')
    OR (section_index = 1 AND section_key = 'why' AND section_label = 'Why you won''t fail')
    OR (section_index = 2 AND section_key = 'system' AND section_label = 'What you get')
    OR (section_index = 3 AND section_key = 'coaching' AND section_label = 'Coaches')
    OR (section_index = 4 AND section_key = 'method' AND section_label = 'How it works')
    OR (section_index = 5 AND section_key = 'pricing' AND section_label = 'Plans')
    OR (section_index = 6 AND section_key = 'faq' AND section_label = 'Questions')
    OR (section_index = 7 AND section_key = 'close' AND section_label = 'Closing offer')
  )
  OR (
    path = '/preview1'
    AND (
      (section_index = 0 AND section_key = 'p1_hero' AND section_label = 'Hero')
      OR (section_index = 1 AND section_key = 'p1_how' AND section_label = 'How it works')
      OR (section_index = 2 AND section_key = 'p1_tracker' AND section_label = 'Tracker')
      OR (section_index = 3 AND section_key = 'p1_included' AND section_label = 'Included')
      OR (section_index = 4 AND section_key = 'p1_moves' AND section_label = 'Movements')
      OR (section_index = 5 AND section_key = 'p1_quiz' AND section_label = 'Quiz')
      OR (section_index = 6 AND section_key = 'p1_plans' AND section_label = 'Plans')
      OR (section_index = 7 AND section_key = 'p1_weeks' AND section_label = 'The weeks')
      OR (section_index = 8 AND section_key = 'p1_faq' AND section_label = 'Questions')
      OR (section_index = 9 AND section_key = 'p1_close' AND section_label = 'Closing offer')
    )
  )
  OR (
    path = '/preview2'
    AND (
      (section_index = 0 AND section_key = 'p2_hero' AND section_label = 'Hero')
      OR (section_index = 1 AND section_key = 'p2_why' AND section_label = 'Tired of no results')
      OR (section_index = 2 AND section_key = 'p2_method' AND section_label = 'How it works')
      OR (section_index = 3 AND section_key = 'p2_coaching' AND section_label = 'Coaches')
      OR (section_index = 4 AND section_key = 'p2_pricing' AND section_label = 'Plans')
      OR (section_index = 5 AND section_key = 'p2_faq' AND section_label = 'Questions')
      OR (section_index = 6 AND section_key = 'p2_close' AND section_label = 'Closing offer')
    )
  )
  OR (
    path = '/preview3'
    AND (
      (section_index = 0 AND section_key = 'p3_hero' AND section_label = 'Hero')
      OR (section_index = 1 AND section_key = 'p3_plans' AND section_label = 'Plans')
      OR (section_index = 2 AND section_key = 'p3_steps' AND section_label = 'How it works')
      OR (section_index = 3 AND section_key = 'p3_faq' AND section_label = 'Questions')
      OR (section_index = 4 AND section_key = 'p3_close' AND section_label = 'Closing offer')
      OR (section_index = 5 AND section_key = 'p3_truth' AND section_label = 'Truth check')
      OR (section_index = 6 AND section_key = 'p3_changes' AND section_label = 'Expected changes')
      OR (section_index = 7 AND section_key = 'p3_quiz' AND section_label = 'Fitness quiz')
    )
  )
);
