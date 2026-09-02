import { requireAdmin } from '../http/auth.js'
import { readJson } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { deviceRegistrationSchema } from '@laap/validation'
import { currentUser, routeUuid, type RouteContext } from './types.js'

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

  if (parts.length === 3 && method === 'DELETE') {
    await requireAdmin(request, runtime.jwtSecret)
    await service.revokeDevice(user.id, routeUuid(parts[2], 'INVALID_DEVICE_ID'))
    return sendJson(response, 200, { success: true })
  }

  throw new HttpError(404, 'NOT_FOUND')
}
