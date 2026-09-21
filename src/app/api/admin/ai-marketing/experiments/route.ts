import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_experiments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, experiments: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json()) as {
    name?: string
    hypothesis?: string
    variable?: string
    control_description?: string
    treatment_description?: string
    success_metric?: string
    budget_cents?: number
    minimum_spend?: number
    minimum_purchases?: number
  }

  if (!body.name || !body.hypothesis || !body.variable) {
    return NextResponse.json(
      { success: false, error: 'name, hypothesis, variable required' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_experiments')
    .insert({
      name: body.name,
      hypothesis: body.hypothesis,
      variable: body.variable,
      control_description: body.control_description ?? null,
      treatment_description: body.treatment_description ?? null,
      success_metric: body.success_metric ?? 'cpa',
      budget_cents: body.budget_cents ?? null,
      minimum_spend: body.minimum_spend ?? 0,
      minimum_purchases: body.minimum_purchases ?? 0,
      status: 'draft',
      created_by: auth.user.id,
    })
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  await writeMarketingAudit({
    agent: 'experiments',
    decision: 'experiment_created',
    action: 'CREATE_NEW_TEST',
    actor_id: auth.user.id,
    execution_result: { experiment_id: data?.id },
  })

  return NextResponse.json({ success: true, experiment: data })
}
