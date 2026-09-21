/**
 * One-shot bounded Meta sync diagnostic (read-only to Meta).
 * Usage: npx tsx --env-file=.env.local scripts/run-meta-sync-diagnostic.ts
 */
import { runDiagnosticMetaSync } from '../src/lib/ai-marketing/meta/sync'
import { loadMetaIntegrationStatus } from '../src/lib/jarvis/diagnostics/meta-sync-pipeline'

async function main() {
  const before = await loadMetaIntegrationStatus()
  console.log(
    JSON.stringify(
      {
        before: {
          configured: before.configured,
          adAccountId: before.adAccountId,
          lastSyncAt: before.lastSyncAt,
          lastSyncError: before.lastSyncError,
          liveExecutionEnabled: before.liveMetaExecutionEnabled,
        },
      },
      null,
      2
    )
  )

  const result = await runDiagnosticMetaSync()
  const after = await loadMetaIntegrationStatus()

  const stageSummary = (result.trace?.stages ?? []).map((s) => ({
    stage: s.stage,
    status: s.status,
    duration_ms: s.duration_ms,
    item_count: s.item_count,
    page_count: s.page_count,
    error_category: s.error_category,
    message: s.message,
  }))

  console.log(
    JSON.stringify(
      {
        SYNC_RESULT: {
          ok: result.ok,
          failed_or_completed_stage: result.failed_stage ?? 'COMPLETE',
          duration_ms: result.trace?.total_duration_ms ?? null,
          rows: {
            campaigns: result.campaignsUpserted,
            adsets: result.adsetsUpserted,
            ads: result.adsUpserted,
            performance: result.performanceRows,
          },
          pages: result.trace?.stages.find((s) => s.stage === 'PAGINATION')?.page_count ?? null,
          api_ok: result.api_ok,
          persistence_ok: result.persistence_ok,
          marketing_performance_written: result.persistence_ok === true && result.performanceRows >= 0,
          lastSyncAt_before: before.lastSyncAt,
          lastSyncAt_after: after.lastSyncAt,
          lastSyncAt_changed: before.lastSyncAt !== after.lastSyncAt,
          last_sync_at_updated_flag: result.last_sync_at_updated,
          audit_written: result.audit_written,
          error: result.error ?? null,
          root_cause:
            result.failed_stage != null
              ? `Stopped at ${result.failed_stage}${result.error ? `: ${result.error}` : ''}`
              : result.ok
                ? 'All stages completed'
                : 'Unknown failure',
        },
        stages: stageSummary,
      },
      null,
      2
    )
  )

  process.exit(result.ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
