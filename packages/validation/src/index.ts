import { z } from 'zod'

export const uuidSchema = z.string().uuid()

export const launchRequestSchema = z.object({
  accountId: z.string().uuid(),
  deviceId: z.string().uuid(),
  nonce: z.string().min(16).max(256),
  signature: z.string().min(32).max(512),
})

export const heartbeatSchema = z.object({
  sessionId: z.string().uuid(),
  runtimeState: z.enum(['LAUNCHING', 'IN_CLIENT', 'IN_GAME', 'RECONNECTING', 'EXITED']),
  observedAt: z.string().datetime(),
})

export const releaseLeaseSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.enum(['manual', 'process_exit', 'logout', 'heartbeat_timeout', 'admin_force_release', 'error']),
})

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
})

export const deviceRegistrationSchema = z.object({
  publicKey: z.string().min(8).max(512),
  platform: z.enum(['windows', 'macos']),
  deviceName: z.string().trim().min(1).max(120),
  appVersion: z.string().trim().min(1).max(32),
})

export const assignmentSchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
  expiresAt: z.string().datetime().nullable().optional(),
})

export const accountCreateSchema = z.object({
  displayName: z.string().trim().min(3).max(80),
  externalId: z.string().trim().min(3).max(120),
  region: z.string().trim().min(2).max(16),
  status: z.enum(['available', 'maintenance', 'disabled']).default('available'),
})

export const accountUpdateSchema = accountCreateSchema.partial().refine((value) => Object.keys(value).length > 0)

export const leaseAcquireSchema = z.object({
  accountId: z.string().uuid(),
  deviceId: z.string().uuid(),
  nonce: z.string().min(16).max(256).optional(),
  signature: z.string().min(8).max(512).optional(),
})

export const credentialSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
})

export type LaunchRequestInput = z.infer<typeof launchRequestSchema>
export type HeartbeatInput = z.infer<typeof heartbeatSchema>
export type ReleaseLeaseInput = z.infer<typeof releaseLeaseSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type DeviceRegistrationInput = z.infer<typeof deviceRegistrationSchema>
export type AssignmentInput = z.infer<typeof assignmentSchema>
export type AccountCreateInput = z.infer<typeof accountCreateSchema>
export type LeaseAcquireInput = z.infer<typeof leaseAcquireSchema>
export type CredentialInput = z.infer<typeof credentialSchema>
