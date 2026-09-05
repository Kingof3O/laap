import { readJson } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { accountCreateSchema, accountUpdateSchema, sessionBlobSchema } from '@laap/validation'
import { currentUser, requireCurrentAdmin, routeUuid, type RouteContext } from './types.js'

export async function handleAccountRoutes(ctx: RouteContext): Promise<void> {
  const { request, response, service, runtime, method, parts } = ctx

  if (parts.length === 4 && parts[3] === 'credential-status' && method === 'GET') {
    throw new HttpError(410, 'RIOT_CREDENTIALS_DISABLED', 'LAAP does not manage Riot credentials. Sign in through the official Riot Client.')
  }
  if (parts.length === 4 && parts[3] === 'credentials' && method === 'POST') {
    throw new HttpError(410, 'RIOT_CREDENTIALS_DISABLED', 'LAAP does not accept Riot credentials. Sign in through the official Riot Client.')
  }

  const user = await currentUser(request, service, runtime)

  if (parts.length === 2 && method === 'GET') {
    return sendJson(response, 200, {
      accounts: await service.listAccounts(user.role === 'admin' ? undefined : user.id),
    })
  }

  if (parts.length === 2 && method === 'POST') {
    requireCurrentAdmin(user)
    const input = accountCreateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_ACCOUNT', 'Account fields are invalid')
    const accountId = await service.createAccount(user.id, input.data)
    return sendJson(response, 201, { accountId })
  }

  if (parts.length === 3 && method === 'PATCH') {
    requireCurrentAdmin(user)
    const input = accountUpdateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_ACCOUNT', 'Account fields are invalid')
    await service.updateAccount(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'), input.data)
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 3 && method === 'DELETE') {
    requireCurrentAdmin(user)
    await service.deleteAccount(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'))
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 4 && parts[3] === 'session-blob' && (method === 'PUT' || method === 'POST')) {
    requireCurrentAdmin(user)
    const input = sessionBlobSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_SESSION_BLOB', 'Session blob is invalid')
    await service.saveAccountSessionBlob(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'), input.data.sessionBlob)
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 4 && parts[3] === 'session-blob' && method === 'DELETE') {
    requireCurrentAdmin(user)
    await service.deleteAccountSessionBlob(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'))
    return sendJson(response, 200, { success: true })
  }

  if (parts.length === 4 && parts[3] === 'release' && method === 'POST') {
    requireCurrentAdmin(user)
    await service.forceReleaseAccount(user, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'))
    return sendJson(response, 200, { success: true })
  }

  throw new HttpError(404, 'NOT_FOUND')
}
