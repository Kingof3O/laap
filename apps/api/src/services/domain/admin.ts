import type { DashboardActivity, DashboardMetrics, DashboardSession, DashboardSnapshot } from '@laap/types'
import type { AssignmentView, AuditView, MaybePromise } from '../service-port.js'

export interface IAdminService {
  listAssignments(): MaybePromise<AssignmentView[]>
  addAssignment(actorId: string, accountId: string, userId: string, expiresAt: string | null): MaybePromise<string>
  revokeAssignment(actorId: string, accountId: string, userId: string): MaybePromise<void>
  listAudit(limit?: number, offset?: number): MaybePromise<AuditView[]>
  recordAudit(actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>): MaybePromise<void>
  getDashboard(userId: string): MaybePromise<DashboardSnapshot>
  getMetrics(userId?: string): MaybePromise<DashboardMetrics>
  listSessions(userId?: string): MaybePromise<DashboardSession[]>
  listActivity(userId?: string): MaybePromise<DashboardActivity[]>
}
