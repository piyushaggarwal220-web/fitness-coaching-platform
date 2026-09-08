/**
 * Standing coach requests: every later AI edit/generation must still honor
 * earlier coach instructions unless the new request explicitly overrides them.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type StandingCoachInstruction = {
  text: string
  section: string | null
  at: string
}

const MAX_STANDING = 12
const TEXT_CAP = 400
const REMAKE_NOISE =
  /remake (the )?(diet|workout|cardio) plan completely from the client profile/i

function truncate(text: string, cap: number): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > cap ? `${trimmed.slice(0, cap - 1)}…` : trimmed
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function formatStandingCoachInstructionsBlock(
  instructions: StandingCoachInstruction[],
  currentInstruction?: string | null
): string {
  const currentKey = currentInstruction?.trim() ? normalizeKey(currentInstruction) : ''
  const kept = instructions.filter((item) => {
    if (!item.text.trim()) return false
    if (currentKey && normalizeKey(item.text) === currentKey) return false
    return true
  })
  if (kept.length === 0) return ''

  const lines = [
    '## Standing coach requests (still in force)',
    'These are earlier coach instructions for this client. Apply ALL of them unless the current request explicitly overrides a point.',
    'Do not undo an older request just because a newer one is about something else.',
    'Diet preference, allergies, dislikes, and foods the client asked the coach to drop stay in force.',
  ]
  for (const item of kept) {
    const when = item.at.slice(0, 10)
    const section = item.section ? ` · ${item.section}` : ''
    lines.push(`- [${when}${section}] ${truncate(item.text, TEXT_CAP)}`)
  }
  return lines.join('\n')
}

function instructionFromRendered(output: unknown): { text: string; section: string | null } | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  const row = output as Record<string, unknown>
  const textCandidates = [row.instruction, row.coachInstruction, row.standingInstruction, row.coachNote]
  const text = textCandidates.find((v): v is string => typeof v === 'string' && v.trim().length >= 4)
  if (!text || REMAKE_NOISE.test(text)) return null
  const section =
    typeof row.section === 'string'
      ? row.section
      : typeof row.instructionSection === 'string'
        ? row.instructionSection
        : null
  return { text: text.trim(), section }
}

export async function loadStandingCoachInstructions(
  admin: SupabaseClient,
  clientId: string
): Promise<StandingCoachInstruction[]> {
  const { data, error } = await admin
    .from('ai_generation_logs')
    .select('action, rendered_output, created_at, success')
    .eq('client_id', clientId)
    .eq('success', true)
    .order('created_at', { ascending: true })
    .limit(80)

  if (error || !data) return []

  const found: StandingCoachInstruction[] = []
  const seen = new Set<string>()
  for (const row of data) {
    if (String(row.action ?? '').endsWith('_started')) continue
    const parsed = instructionFromRendered(row.rendered_output)
    if (!parsed) continue
    const key = normalizeKey(parsed.text)
    if (seen.has(key)) continue
    seen.add(key)
    found.push({
      text: parsed.text,
      section: parsed.section,
      at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    })
  }
  return found.slice(-MAX_STANDING)
}
