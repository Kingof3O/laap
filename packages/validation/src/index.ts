import { z } from 'zod'

export const uuidSchema = z.string().uuid()

export const releaseLeaseSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.enum(['manual', 'logout', 'lease_timeout', 'admin_force_release', 'error']),
})

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  remember: z.boolean().optional().default(false),
})

export const userCreateSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(256),
  role: z.enum(['operator', 'admin']).default('operator'),
})

export const userUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(['operator', 'admin']).optional(),
  status: z.enum(['active', 'suspended', 'disabled']).optional(),
}).refine((value) => Object.keys(value).length > 0)

export const userPasswordResetSchema = z.object({
  password: z.string().min(12).max(256),
})

export const deviceRegistrationSchema = z.object({
  publicKey: z.string().regex(/^[A-Za-z0-9+/]{43}$/, 'Ed25519 public key must be 32-byte base64 without padding'),
  platform: z.enum(['windows', 'macos']),
  deviceName: z.string().trim().min(1).max(120),
  appVersion: z.string().trim().min(1).max(32),
})

export const deviceHeartbeatSchema = z.object({
  appVersion: z.string().trim().min(1).max(32).optional(),
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
  deviceId: z.string().optional(),
  nonce: z.string().min(16).max(256).optional(),
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}$/, 'Signature must be a 64-byte base64 value').optional(),
})

export const leaseHeartbeatSchema = z.object({
  runtimeState: z.enum(['LAUNCHING', 'IN_CLIENT', 'IN_GAME', 'RECONNECTING', 'EXITED']).optional().default('IN_CLIENT'),
})

export const sessionBlobSchema = z.object({
  sessionBlob: z.string().min(10).max(131072),
})

export type ReleaseLeaseInput = z.infer<typeof releaseLeaseSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type UserCreateInput = z.infer<typeof userCreateSchema>
export type UserUpdateInput = z.infer<typeof userUpdateSchema>
export type UserPasswordResetInput = z.infer<typeof userPasswordResetSchema>
export type DeviceRegistrationInput = z.infer<typeof deviceRegistrationSchema>
export type DeviceHeartbeatInput = z.infer<typeof deviceHeartbeatSchema>
export type AssignmentInput = z.infer<typeof assignmentSchema>
export type AccountCreateInput = z.infer<typeof accountCreateSchema>
export type LeaseAcquireInput = z.infer<typeof leaseAcquireSchema>
export type LeaseHeartbeatInput = z.infer<typeof leaseHeartbeatSchema>
export type SessionBlobInput = z.infer<typeof sessionBlobSchema>
