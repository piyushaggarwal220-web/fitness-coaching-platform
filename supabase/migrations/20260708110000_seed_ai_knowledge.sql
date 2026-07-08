-- Seed core coaching knowledge for AI prompt injection (idempotent)

INSERT INTO ai_knowledge (title, category, content, version, active)
SELECT v.title, v.category, v.content, 1, true
FROM (VALUES
  (
    'Fat loss fundamentals',
    'fat_loss',
    'Target a sustainable 300–500 kcal daily deficit. Prioritise protein 1.8–2.2 g/kg bodyweight. Keep fibre high for satiety. Weigh 3–4 mornings per week; trend matters more than single readings. Never drop below ~1600 kcal without medical oversight.'
  ),
  (
    'Muscle gain fundamentals',
    'muscle_gain',
    'Target a 200–300 kcal surplus with protein 1.6–2.2 g/kg. Progress load or reps when all prescribed sets are completed with good form. Sleep 7–9 hours for recovery. Gain 0.25–0.5 kg per week as a practical upper bound for lean gains.'
  ),
  (
    'Recomposition guidance',
    'recomposition',
    'At maintenance or slight deficit with high protein (2.0+ g/kg). Combine resistance training 3–5 days/week with moderate cardio. Progress strength consistently; scale weight may change slowly while measurements improve.'
  ),
  (
    'Strength programming',
    'strength',
    'Prioritise compound lifts, 3–6 rep ranges for main lifts, longer rest (2–4 min). Deload every 4–8 weeks or when performance stalls with poor recovery. Technique before load.'
  ),
  (
    'Nutrition principles',
    'nutrition',
    'Build meals around protein, vegetables, and minimally processed carbs. Distribute protein across 3–5 meals. Hydration ~2–3 L/day unless medically restricted. Align meal timing with client schedule for adherence.'
  ),
  (
    'Cardio guidelines',
    'cardio',
    'LISS 20–40 min post-workout or on rest days for fat loss. Limit HIIT to 1–2 sessions/week if recovery is poor. Step targets support NEAT; do not replace resistance training with cardio volume.'
  ),
  (
    'Supplement guidance',
    'supplements',
    'Evidence-supported basics: creatine monohydrate 3–5 g/day, vitamin D if deficient, whey if protein gap exists. Supplements do not replace food. Avoid recommending medical-grade doses without clearance.'
  ),
  (
    'Recovery principles',
    'recovery',
    'Sleep is the primary recovery tool. Manage training volume when sleep <6 h or stress is high. Active recovery walks and mobility on rest days. Two rest days per week minimum for most beginners.'
  ),
  (
    'Weekly check-in interpretation',
    'checkins',
    'Use weight trend, waist, hunger, energy, training performance, and adherence together — never one metric alone. Hunger 8+/10 with fat loss goal → increase protein/fibre or small calorie adjustment. Adherence <7 → simplify plan.'
  ),
  (
    'Injury modifications',
    'injuries',
    'Never train through sharp pain. Substitute aggravating movements (e.g. knee pain: limit deep flexion, use hip hinge variations). Recommend medical clearance for acute or worsening symptoms.'
  ),
  (
    'Female-specific considerations',
    'female',
    'Account for menstrual cycle energy fluctuations; maintain protein and iron-rich foods. Avoid extreme deficits; bone health and hormonal balance matter for long-term adherence.'
  ),
  (
    'Beginner training',
    'beginner',
    'Full-body or upper/lower 3 days/week. Teach form before load. 8–15 reps, 2–3 sets per exercise. Progress one variable at a time. Keep sessions under 60 minutes.'
  ),
  (
    'Intermediate training',
    'intermediate',
    'Use structured splits (PPL, upper/lower). Periodise volume and intensity. Track loads. Deload when performance drops 2+ weeks despite adequate sleep.'
  ),
  (
    'Advanced training',
    'advanced',
    'Individualise volume landmarks, weak-point work, and mesocycles. Autoregulate load via RPE/RIR. Recovery capacity limits frequency — quality over novelty.'
  )
) AS v(title, category, content)
WHERE NOT EXISTS (
  SELECT 1 FROM ai_knowledge k WHERE k.category = v.category AND k.active = true
);
