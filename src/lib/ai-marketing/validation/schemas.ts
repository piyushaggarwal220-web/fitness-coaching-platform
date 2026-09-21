import { z } from 'zod'

export const creativeConceptSchema = z.object({
  concept_name: z.string().min(2).max(120),
  angle: z.string().min(2).max(80),
  hook: z.string().min(2).max(280),
  headline: z.string().min(2).max(120),
  primary_text: z.string().min(10).max(2000),
  description: z.string().min(2).max(400),
  cta: z.string().min(2).max(40),
  visual_direction: z.string().min(5).max(800),
  image_generation_prompt: z.string().min(10).max(1200),
  target_audience: z.string().min(2).max(300),
  hypothesis: z.string().min(5).max(600),
  expected_test_reason: z.string().min(5).max(600),
})

export const creativeBatchSchema = z.object({
  concepts: z.array(creativeConceptSchema).min(1).max(50),
})

export const analyticsFindingSchema = z.object({
  issue: z.string().min(3).max(300),
  evidence: z.array(z.string()).min(1).max(12),
  evidence_strength: z.enum([
    'insufficient_data',
    'possible_issue',
    'strong_evidence',
    'recommended_test',
  ]),
  recommendation: z.string().min(3).max(800),
  recommended_action: z.enum([
    'PAUSE_AD',
    'RESUME_AD',
    'INCREASE_BUDGET',
    'DECREASE_BUDGET',
    'KEEP_RUNNING',
    'CREATE_NEW_CREATIVE',
    'CREATE_NEW_TEST',
    'INVESTIGATE_FUNNEL',
    'NO_ACTION',
    'SYNC_META',
    'CREATE_CAMPAIGN',
    'CREATE_ADSET',
    'CREATE_AD',
    'CREATE_CREATIVE',
    'UPDATE_AD',
    'UPDATE_CAMPAIGN',
    'UPDATE_ADSET',
    'GENERATE_VARIATIONS',
    'LAUNCH_EXPERIMENT',
    'NOTIFY',
    'INCREASE_FUNNEL_BUDGET',
    'DECREASE_FUNNEL_BUDGET',
    'CONTINUE_TESTING_FUNNELS',
    'REALLOCATE_BUDGET_RECOMMENDATION',
  ]),
  confidence: z.number().min(0).max(1),
  estimated_impact_category: z.enum(['low', 'medium', 'high']),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  funnel_id: z.string().uuid().optional(),
  requires_human_approval: z.boolean(),
  caveats: z.array(z.string()).default([]),
})

export const analyticsReportSchema = z.object({
  summary: z.string().min(5).max(2000),
  findings: z.array(analyticsFindingSchema).max(40),
  winners: z.array(z.string()).default([]),
  losers: z.array(z.string()).default([]),
  insufficient_data: z.array(z.string()).default([]),
  correlation_disclaimer:
    z.string().default('Correlation does not prove causation; treat findings as hypotheses.'),
})

export const structuredDecisionSchema = z.object({
  decision: z.string().min(2).max(300),
  reason: z.string().min(5).max(2000),
  evidence: z.array(z.string()).min(1).max(12),
  confidence: z.number().min(0).max(1),
  recommended_action: analyticsFindingSchema.shape.recommended_action,
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  estimated_impact: z.string().optional(),
})

export const decisionBatchSchema = z.object({
  decisions: z.array(structuredDecisionSchema).min(1).max(30),
})

export const ugcConceptSchema = z.object({
  ugc_concept: z.string().min(2).max(200),
  target_persona: z.string().min(2).max(300),
  hook: z.string().min(2).max(280),
  script: z.string().min(20).max(4000),
  scenes: z.array(z.object({
    scene: z.number().int().positive(),
    instruction: z.string().min(5).max(500),
    dialogue: z.string().max(800).optional(),
  })).min(1).max(20),
  cta: z.string().min(2).max(80),
  visual_instructions: z.string().min(5).max(1000),
  voice_instructions: z.string().min(5).max(600),
  caption: z.string().min(5).max(2200),
  content_label: z.enum([
    'ai_generated_presenter',
    'scripted_advertisement',
    'real_customer_testimonial',
  ]),
  disclaimer: z.string().min(5).max(400),
})

export const ugcBatchSchema = z.object({
  concepts: z.array(ugcConceptSchema).min(1).max(20),
})

export const instagramIdeaSchema = z.object({
  content_topic: z.string().min(2).max(200),
  hook: z.string().min(2).max(280),
  script: z.string().min(10).max(3000),
  caption: z.string().min(5).max(2200),
  keywords: z.array(z.string()).max(12),
  hashtags: z.array(z.string()).max(15),
  cta: z.string().min(2).max(80),
  content_category: z.string().min(2).max(80),
  reason_for_recommendation: z.string().min(5).max(600),
})

export const instagramBatchSchema = z.object({
  ideas: z.array(instagramIdeaSchema).min(1).max(20),
  seo_notes: z.array(z.string()).default([]),
})

export const funnelDiagnosisSchema = z.object({
  primary_problem: z.enum(['ad', 'funnel', 'offer', 'tracking', 'insufficient_data']),
  reason: z.string().min(5).max(1500),
  evidence: z.array(z.string()).min(1).max(12),
  confidence: z.number().min(0).max(1),
  recommendations: z.array(z.string()).min(1).max(10),
})
