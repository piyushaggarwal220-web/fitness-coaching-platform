import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_GUARDRAILS,
  type AutonomyLevel,
  type BrandContext,
  type GuardrailSettings,
} from '@/lib/ai-marketing/types'

const DEFAULT_BRAND: BrandContext = {
  name: 'LURVOX',
  tagline: 'Personal coaching that transforms',
  products: [
    { id: 'coaching_3m', name: '3-Month Coaching', category: 'coaching' },
    { id: 'coaching_6m', name: '6-Month Coaching', category: 'coaching' },
    { id: 'coaching_12m', name: '12-Month Coaching', category: 'coaching' },
  ],
  primary_audiences: [
    'Busy professionals who want fat loss with structure',
    'Beginners who feel lost in the gym',
    'People restarting after inconsistency',
  ],
  offers: [
    'Personal coaching with weekly check-ins',
    'Custom diet + workout plans',
    'Coach accountability',
  ],
  website: 'https://www.lurvox.in',
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error || data?.value === undefined || data?.value === null) return fallback
  return data.value as T
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedBy?: string | null
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('marketing_settings').upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    },
    { onConflict: 'key' }
  )
  if (error) throw new Error(`Failed to save setting ${key}: ${error.message}`)
}

export async function getAutonomyLevel(): Promise<AutonomyLevel> {
  const raw = await getSetting<number | string>('MARKETING_AUTONOMY_LEVEL', 2)
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw)
  if (n === 0 || n === 1 || n === 2 || n === 3 || n === 4) return n
  return 2
}

/**
 * Levels 3–4 require an explicit confirmation flag so they cannot be
 * enabled by accident via a normal settings save.
 */
export async function setAutonomyLevel(
  level: AutonomyLevel,
  opts: { confirmHighAutonomy?: boolean; updatedBy?: string | null } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  if ((level === 3 || level === 4) && !opts.confirmHighAutonomy) {
    return {
      ok: false,
      error:
        'Levels 3 and 4 require confirm_high_autonomy=true. Default remains level 2 (approval required).',
    }
  }
  await setSetting('MARKETING_AUTONOMY_LEVEL', level, opts.updatedBy)
  return { ok: true }
}

export async function getGuardrails(): Promise<GuardrailSettings> {
  const raw = await getSetting<Partial<GuardrailSettings>>('guardrails', {})
  return { ...DEFAULT_GUARDRAILS, ...raw }
}

export async function saveGuardrails(
  partial: Partial<GuardrailSettings>,
  updatedBy?: string | null
): Promise<GuardrailSettings> {
  const current = await getGuardrails()
  const next = { ...current, ...partial }
  await setSetting('guardrails', next, updatedBy)
  return next
}

export async function getBrandContext(): Promise<BrandContext> {
  const raw = await getSetting<Partial<BrandContext>>('brand', {})
  return {
    ...DEFAULT_BRAND,
    ...raw,
    products: raw.products?.length ? raw.products : DEFAULT_BRAND.products,
    primary_audiences: raw.primary_audiences?.length
      ? raw.primary_audiences
      : DEFAULT_BRAND.primary_audiences,
    offers: raw.offers?.length ? raw.offers : DEFAULT_BRAND.offers,
  }
}
