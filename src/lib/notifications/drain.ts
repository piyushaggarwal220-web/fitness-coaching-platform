import 'server-only'
import { after } from 'next/server'
import {
  notificationDrainPlan,
  OPPORTUNISTIC_LEASE_SECONDS,
} from '@/lib/notifications/drain-policy'

function reportDrainError(mode: string, error: unknown): void {
  console.error(
    `[notifications] ${mode} drain failed:`,
    error instanceof Error ? error.message : 'Unknown drain failure'
  )
}

/** Drain only the newly-created event after its request response has finished. */
export function scheduleImmediateNotificationDrain(eventId: string): void {
  const plan = notificationDrainPlan('immediate', eventId)
  try {
    after(async () => {
      try {
        const { processNotificationJobs } = await import('@/lib/notifications/worker')
        await processNotificationJobs(plan.limit, plan.eventId)
      } catch (error) {
        reportDrainError(plan.mode, error)
      }
    })
  } catch (error) {
    // Some non-request producers do not have a Next request context. The durable
    // job remains queued for authenticated activity or daily reconciliation.
    reportDrainError('immediate scheduling', error)
  }
}

/** Rate-limited, bounded catch-up work after authenticated request activity. */
export function scheduleOpportunisticNotificationDrain(): void {
  const plan = notificationDrainPlan('opportunistic')
  try {
    after(async () => {
      try {
        const {
          acquireOpportunisticDrainLease,
          processNotificationJobs,
        } = await import('@/lib/notifications/worker')
        const acquired = await acquireOpportunisticDrainLease(OPPORTUNISTIC_LEASE_SECONDS)
        if (acquired) await processNotificationJobs(plan.limit)
      } catch (error) {
        reportDrainError(plan.mode, error)
      }
    })
  } catch (error) {
    reportDrainError('opportunistic scheduling', error)
  }
}
