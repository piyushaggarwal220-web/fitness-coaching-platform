/**
 * Phase 22 — Hardening barrel
 */
export {
  runHardeningAudit,
  auditPermissionMatrix,
  auditExecutionSafety,
  auditMemoryIntegrity,
  auditFunnelIsolation,
  auditExperimentIntegrity,
  auditPlanIntegrity,
  auditSecretPatterns,
} from '@/lib/jarvis/hardening/audit'
export type { AuditFinding } from '@/lib/jarvis/hardening/audit'
