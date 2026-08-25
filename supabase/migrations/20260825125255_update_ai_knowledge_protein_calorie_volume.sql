-- Honest protein, 1800 kcal floor, fewer working sets in AI knowledge.

UPDATE ai_knowledge
SET
  content = $kb$Target a sustainable 250–400 kcal daily deficit (never more than 400 from maintenance). Protein around 1.6–2.0 g/kg is optional when it fits naturally — not a target to push toward. If allowed foods cannot hit that protein, lower protein and keep calories high (minimum 1800 kcal) so the client can function. Never cut calories to chase protein grams, and never write protein higher than the meals actually contain. Daily totals count only the primary meal option, never primary plus swap. Weigh 3–4 mornings per week; trend matters more than single readings. If a lower intake than 1800 kcal seems indicated, still write 1800+ and flag the coach.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'fat_loss'
  AND title = 'Fat loss fundamentals'
  AND active = true
  AND content IS DISTINCT FROM $kb$Target a sustainable 250–400 kcal daily deficit (never more than 400 from maintenance). Protein around 1.6–2.0 g/kg is optional when it fits naturally — not a target to push toward. If allowed foods cannot hit that protein, lower protein and keep calories high (minimum 1800 kcal) so the client can function. Never cut calories to chase protein grams, and never write protein higher than the meals actually contain. Daily totals count only the primary meal option, never primary plus swap. Weigh 3–4 mornings per week; trend matters more than single readings. If a lower intake than 1800 kcal seems indicated, still write 1800+ and flag the coach.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$Target a 200–300 kcal surplus. Protein 1.6–2.0 g/kg is optional when comfortable — if it is not possible with their foods, lower protein and keep calories in surplus. Never inflate protein numbers. Progress load or reps when all prescribed sets are completed with good form. Sleep 7–9 hours for recovery.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'muscle_gain'
  AND title = 'Muscle gain fundamentals'
  AND active = true
  AND content IS DISTINCT FROM $kb$Target a 200–300 kcal surplus. Protein 1.6–2.0 g/kg is optional when comfortable — if it is not possible with their foods, lower protein and keep calories in surplus. Never inflate protein numbers. Progress load or reps when all prescribed sets are completed with good form. Sleep 7–9 hours for recovery.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$At maintenance or slight deficit. Protein need not be maximised; if high protein is not possible, lower it and keep calories up for daily functioning. Never invent high protein numbers. Combine resistance training 3–5 days/week with moderate cardio.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'recomposition'
  AND title = 'Recomposition guidance'
  AND active = true
  AND content IS DISTINCT FROM $kb$At maintenance or slight deficit. Protein need not be maximised; if high protein is not possible, lower it and keep calories up for daily functioning. Never invent high protein numbers. Combine resistance training 3–5 days/week with moderate cardio.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$Prioritise compound lifts, 3–6 rep ranges for main lifts, longer rest (2–4 min). 2–3 working sets per exercise (4 only on one main compound). Never 5+ working sets. Deload every 4–8 weeks or when performance stalls with poor recovery.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'strength'
  AND title = 'Strength programming'
  AND active = true
  AND content IS DISTINCT FROM $kb$Prioritise compound lifts, 3–6 rep ranges for main lifts, longer rest (2–4 min). 2–3 working sets per exercise (4 only on one main compound). Never 5+ working sets. Deload every 4–8 weeks or when performance stalls with poor recovery.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$Build meals around foods the client will actually eat. If protein is hard to hit, reduce protein and keep calories at or above 1800 kcal using carbs and fats they already eat. Never inflate meal or header protein numbers. Hydration ~2–3 L/day unless medically restricted.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'nutrition'
  AND title = 'Nutrition principles'
  AND active = true
  AND content IS DISTINCT FROM $kb$Build meals around foods the client will actually eat. If protein is hard to hit, reduce protein and keep calories at or above 1800 kcal using carbs and fats they already eat. Never inflate meal or header protein numbers. Hydration ~2–3 L/day unless medically restricted.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$Use weight trend, waist, hunger, energy, training performance, and adherence together. Hunger 8+/10 → try fibre, food volume, meal timing, or a small calorie adjustment first — do not default to pushing protein higher.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'checkins'
  AND title = 'Weekly check-in interpretation'
  AND active = true
  AND content IS DISTINCT FROM $kb$Use weight trend, waist, hunger, energy, training performance, and adherence together. Hunger 8+/10 → try fibre, food volume, meal timing, or a small calorie adjustment first — do not default to pushing protein higher.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$Account for menstrual cycle energy fluctuations. Keep calories at or above 1800 kcal for daily functioning. Protein can be moderate if high protein is not possible; never inflate numbers. Prefer iron-rich foods. Avoid extreme deficits.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'female'
  AND title = 'Female-specific considerations'
  AND active = true
  AND content IS DISTINCT FROM $kb$Account for menstrual cycle energy fluctuations. Keep calories at or above 1800 kcal for daily functioning. Protein can be moderate if high protein is not possible; never inflate numbers. Prefer iron-rich foods. Avoid extreme deficits.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$Full-body or upper/lower 3 days/week. Teach form before load. 8–15 reps, 2–3 working sets per exercise. Do not add extra sets for volume.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'beginner'
  AND title = 'Beginner training'
  AND active = true
  AND content IS DISTINCT FROM $kb$Full-body or upper/lower 3 days/week. Teach form before load. 8–15 reps, 2–3 working sets per exercise. Do not add extra sets for volume.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$Use structured splits (PPL, upper/lower). 3 working sets per exercise is enough; 4 only on one main compound. Do not stack 5+ sets. Track loads.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'intermediate'
  AND title = 'Intermediate training'
  AND active = true
  AND content IS DISTINCT FROM $kb$Use structured splits (PPL, upper/lower). 3 working sets per exercise is enough; 4 only on one main compound. Do not stack 5+ sets. Track loads.$kb$;

UPDATE ai_knowledge
SET
  content = $kb$Individualise volume landmarks and mesocycles. Still cap working sets: 3 per exercise, 4 on one main compound only. Autoregulate load via RPE/RIR.$kb$,
  version = version + 1,
  updated_at = now()
WHERE category = 'advanced'
  AND title = 'Advanced training'
  AND active = true
  AND content IS DISTINCT FROM $kb$Individualise volume landmarks and mesocycles. Still cap working sets: 3 per exercise, 4 on one main compound only. Autoregulate load via RPE/RIR.$kb$;
