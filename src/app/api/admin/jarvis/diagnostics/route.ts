import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { sanitizePublicJson } from '@/lib/jarvis/operator-errors'
import { runHealthChecks } from '@/lib/jarvis/diagnostics/health-checks'
import { runDiagnostic, runSelfTest } from '@/lib/jarvis/diagnostics/diagnostic-engine'
import {
  listDiagnosticRuns,
  listIncidents,
  listRegressionTests,
} from '@/lib/jarvis/diagnostics/diagnostic-memory'
import { resolveApproval } from '@/lib/jarvis/permissions/approval-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  ensureJarvisToolsRegistered()
  try {
    const [checks, incidents, runs, tests] = await Promise.all([
      runHealthChecks(),
      listIncidents().catch(() => []),
      listDiagnosticRuns().catch(() => []),
      listRegressionTests().catch(() => []),
    ])
    return NextResponse.json({
      success: true,
      diagnostics: sanitizePublicJson({
        health: checks,
        incidents,
        runs,
        regression_tests: tests,
        active: incidents.filter((i) =>
          ['open', 'investigating', 'diagnosed', 'awaiting_approval', 'applying', 'testing'].includes(
            String((i as { status?: string }).status)
          )
        ),
        resolved: incidents.filter((i) => String((i as { status?: string }).status) === 'resolved'),
        failed: incidents.filter((i) =>
          ['failed', 'budget_exhausted'].includes(String((i as { status?: string }).status))
        ),
      }),
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Diagnostics failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  ensureJarvisToolsRegistered()
  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    problem?: string
    approval_id?: string
    approve?: boolean
  }
  const action = body.action || 'diagnose'

  try {
    if (action === 'health') {
      return NextResponse.json({ success: true, health: sanitizePublicJson(await runHealthChecks()) })
    }
    if (action === 'self_test') {
      return NextResponse.json({ success: true, result: sanitizePublicJson(await runSelfTest()) })
    }
    if (action === 'decide' && body.approval_id) {
      const result = await resolveApproval({
        approvalId: body.approval_id,
        approve: Boolean(body.approve),
        actorId: auth.user.id,
      })
      return NextResponse.json({ success: result.ok, approval: sanitizePublicJson(result) })
    }
    const report = await runDiagnostic({
      problem: body.problem || 'Why is Shopify revenue showing zero?',
      actorId: auth.user.id,
      persist: true,
    })
    return NextResponse.json({ success: true, report: sanitizePublicJson(report) })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Diagnostic action failed' },
      { status: 500 }
    )
  }
}
