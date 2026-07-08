/**
 * Verify AI knowledge base has entries and retrieval matches client profiles.
 * Run: npx tsx --env-file=.env.local scripts/verify-knowledge-base.ts
 */
import { calculateComplexityScore } from '../src/lib/ai/complexity-score'
import { getAllKnowledge } from '../src/lib/ai/knowledge'
import {
  buildPrompt,
  filterKnowledgeEntries,
  selectKnowledgeCategories,
} from '../src/lib/ai/prompt-builder'
import { profileToComplexityInput } from '../src/lib/ai/generate-plan'
import type { OnboardingProfile } from '../src/types/database'

let failures = 0

function fail(msg: string): void {
  failures++
  console.error(`FAIL: ${msg}`)
}

function pass(msg: string): void {
  console.log(`PASS: ${msg}`)
}

const profiles: { label: string; profile: OnboardingProfile }[] = [
  {
    label: 'fat-loss female beginner',
    profile: {
      id: 'kb-1',
      name: 'Test',
      role: 'client',
      fitness_goal: 'fat_loss',
      gender: 'female',
      training_experience: 'beginner',
      injuries: 'None',
      onboarding_complete: true,
    },
  },
  {
    label: 'muscle gain male advanced',
    profile: {
      id: 'kb-2',
      name: 'Test',
      role: 'client',
      fitness_goal: 'muscle_gain',
      gender: 'male',
      training_experience: 'advanced',
      onboarding_complete: true,
    },
  },
]

async function main(): Promise<void> {
  console.log('=== Knowledge Base Verification ===\n')

  const { data: entries, error } = await getAllKnowledge()
  if (error) {
    fail(`getAllKnowledge error: ${error}`)
    process.exit(1)
  }

  const active = entries ?? []
  console.log(`Active knowledge entries in database: ${active.length}`)

  if (active.length === 0) {
    fail(
      'Knowledge base is empty. Run: node scripts/apply-pending-migrations.mjs (includes seed migration)'
    )
    process.exit(1)
  }

  const categories = new Set(active.map((e) => e.category))
  pass(`Found ${categories.size} categories with active entries`)

  for (const { label, profile } of profiles) {
    const selected = selectKnowledgeCategories(profile)
    const filtered = filterKnowledgeEntries(active, selected)
    if (filtered.length === 0) {
      fail(`${label}: no knowledge matched for categories [${selected.join(', ')}]`)
      continue
    }

    const complexityScore = calculateComplexityScore(profileToComplexityInput(profile))
    const built = buildPrompt({
      profile,
      complexityScore,
      knowledgeEntries: active,
      actionTemplate: 'Generate plan.',
      systemTemplate: '# System\n[KNOWLEDGE BASE]\n[COMPLEXITY]',
    })

    const corpus = `${built.systemPrompt}\n${built.userPrompt}`
    const kbCount = (corpus.match(/## Coaching Knowledge Base/g) ?? []).length
    if (kbCount === 0) {
      fail(`${label}: knowledge section not injected`)
      continue
    }
    if (kbCount > 1) {
      fail(`${label}: knowledge duplicated ${kbCount} times`)
      continue
    }
    if (corpus.includes('[KNOWLEDGE BASE]')) {
      fail(`${label}: unreplaced [KNOWLEDGE BASE] placeholder`)
      continue
    }

    const first = filtered[0]!
    if (!corpus.includes(first.title)) {
      fail(`${label}: expected entry "${first.title}" not found in prompt`)
      continue
    }

    pass(`${label}: ${filtered.length} entries injected (${selected.join(', ')})`)
  }

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('Knowledge base verification passed.')
}

void main()
