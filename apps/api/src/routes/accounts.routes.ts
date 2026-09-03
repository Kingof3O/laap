import { requireAdmin } from '../http/auth.js'
import { readJson } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { accountCreateSchema, accountUpdateSchema, sessionBlobSchema } from '@laap/validation'
import { currentUser, routeUuid, type RouteContext } from './types.js'

export async function handleAccountRoutes(ctx: RouteContext): Promise<void> {
  const { request, response, service, runtime, method, parts } = ctx

  if (parts.length === 4 && parts[3] === 'credential-status' && method === 'GET') {
    throw new HttpError(410, 'RIOT_RSO_REQUIRED', 'Riot accounts must be linked through the approved Riot Sign On flow')
  }
  if (parts.length === 4 && parts[3] === 'credentials' && method === 'POST') {
    throw new HttpError(410, 'RIOT_RSO_REQUIRED', 'Riot credentials are never accepted by LAAP; use Riot Sign On')
  }

  const user = await currentUser(request, service, runtime)

  if (parts.length === 2 && method === 'GET') {
    return sendJson(response, 200, {
      accounts: await service.listAccounts(user.role === 'admin' ? undefined : user.id),
    })
  }

  if (parts.length === 2 && method === 'POST') {
    await requireAdmin(request, runtime.jwtSecret)
    const input = accountCreateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_ACCOUNT', 'Account fields are invalid')
    const accountId = await service.createAccount(user.id, input.data)
    return sendJson(response, 201, { accountId })
  }

  if (parts.length === 3 && method === 'PATCH') {
    await requireAdmin(request, runtime.jwtSecret)
    const input = accountUpdateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_ACCOUNT', 'Account fields are invalid')
    await service.updateAccount(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'), input.data)
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 3 && method === 'DELETE') {
    await requireAdmin(request, runtime.jwtSecret)
    await service.deleteAccount(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'))
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 4 && parts[3] === 'session-blob' && (method === 'PUT' || method === 'POST')) {
    await requireAdmin(request, runtime.jwtSecret)
    const input = sessionBlobSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_SESSION_BLOB', 'Session blob is invalid')
    await service.saveAccountSessionBlob(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'), input.data.sessionBlob)
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 4 && parts[3] === 'session-blob' && method === 'DELETE') {
    await requireAdmin(request, runtime.jwtSecret)
    await service.deleteAccountSessionBlob(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'))
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 4 && parts[3] === 'release' && method === 'POST') {
    await requireAdmin(request, runtime.jwtSecret)
    await service.forceReleaseAccount(user, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'))
    return sendJson(response, 200, { success: true })
  }

  throw new HttpError(404, 'NOT_FOUND')
}
