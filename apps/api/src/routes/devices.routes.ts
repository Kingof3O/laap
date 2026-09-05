import { readJson } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { deviceHeartbeatSchema, deviceRegistrationSchema } from '@laap/validation'
import { currentUser, requireCurrentAdmin, routeUuid, type RouteContext } from './types.js'

export async function handleDeviceRoutes(ctx: RouteContext): Promise<void> {
  const { request, response, service, runtime, method, parts } = ctx
  const user = await currentUser(request, service, runtime)

  if (parts.length === 2 && method === 'GET') {
    return sendJson(response, 200, {
      devices: await service.listDevices(user.role === 'admin' ? undefined : user.id),
    })
  }

  if (parts.length === 2 && method === 'POST') {
    const input = deviceRegistrationSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_DEVICE', 'Device fields are invalid')
    const deviceId = await service.registerDevice(user.id, input.data)
    return sendJson(response, 201, { deviceId })
  }

  if (parts.length === 4 && parts[3] === 'heartbeat' && method === 'POST') {
    const input = deviceHeartbeatSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_DEVICE_HEARTBEAT', 'Device heartbeat is invalid')
    await service.touchDevice(user.id, routeUuid(parts[2], 'INVALID_DEVICE_ID'), input.data.appVersion)
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 4 && parts[3] === 'approve' && method === 'POST') {
    requireCurrentAdmin(user)
    await service.approveDevice(user.id, routeUuid(parts[2], 'INVALID_DEVICE_ID'))
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 3 && method === 'DELETE') {
    requireCurrentAdmin(user)
    await service.revokeDevice(user.id, routeUuid(parts[2], 'INVALID_DEVICE_ID'))
    return sendJson(response, 200, { success: true })
  }

  throw new HttpError(404, 'NOT_FOUND')
}
