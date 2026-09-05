import { readJson } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { leaseAcquireSchema, leaseHeartbeatSchema } from '@laap/validation'
import { currentUser, routeUuid, serviceErrorToHttp, type RouteContext } from './types.js'

export async function handleLeaseRoutes(ctx: RouteContext): Promise<void> {
  const { request, response, service, runtime, method, parts } = ctx
  const user = await currentUser(request, service, runtime)

  if (parts[2] === 'acquire' && method === 'POST') {
    const input = leaseAcquireSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_LEASE_REQUEST', 'Account and device are required')
    const signed = Boolean(input.data.nonce || input.data.signature)
    if (signed !== Boolean(input.data.nonce && input.data.signature)) {
      throw new HttpError(400, 'INVALID_DEVICE_SIGNATURE', 'Nonce and signature must be supplied together')
    }
    if (runtime.nodeEnv === 'production' && !signed) {
      throw new HttpError(401, 'DEVICE_SIGNATURE_REQUIRED', 'A signed device challenge is required')
    }
    if (signed && !(await service.verifyDeviceChallenge(user.id, input.data.deviceId, input.data.accountId, input.data.nonce!, input.data.signature!))) {
      throw new HttpError(401, 'INVALID_DEVICE_SIGNATURE', 'Device challenge could not be verified')
    }
    try {
      return sendJson(response, 200, await service.acquireLease(user.id, input.data.accountId, input.data.deviceId, input.data))
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }

  if (parts.length === 4 && parts[3] === 'release' && method === 'POST') {
    const input = await readJson<{ reason?: string }>(request)
    try {
      return sendJson(response, 200, await service.releaseLease(user, routeUuid(parts[2], 'INVALID_SESSION_ID'), input.reason ?? 'manual'))
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }

  if (parts.length === 4 && parts[3] === 'heartbeat' && method === 'POST') {
    const input = leaseHeartbeatSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_HEARTBEAT', 'Runtime state is invalid')
    try {
      return sendJson(response, 200, await service.heartbeatLease(user.id, routeUuid(parts[2], 'INVALID_SESSION_ID'), input.data.runtimeState))
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }

  if (parts.length === 4 && parts[3] === 'session-blob' && method === 'GET') {
    try {
      const sessionBlob = await service.getAccountSessionBlob(user.id, routeUuid(parts[2], 'INVALID_SESSION_ID'))
      return sendJson(response, 200, { sessionBlob })
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }

  throw new HttpError(404, 'NOT_FOUND')
}
