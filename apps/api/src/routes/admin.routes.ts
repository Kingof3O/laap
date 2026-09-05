import { readJson } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { assignmentSchema, userCreateSchema, userPasswordResetSchema, userUpdateSchema } from '@laap/validation'
import { currentUser, queryInteger, requireCurrentAdmin, routeUuid, serviceErrorToHttp, type RouteContext } from './types.js'

export async function handleAdminAndDashboardRoutes(ctx: RouteContext): Promise<void> {
  const { request, response, service, runtime, url, method, parts } = ctx
  const user = await currentUser(request, service, runtime)
  const scopedUserId = user.role === 'admin' ? undefined : user.id

  if (parts[1] === 'dashboard' && parts.length === 2 && method === 'GET') {
    return sendJson(response, 200, await service.getDashboard(user.id))
  }
  if (parts[1] === 'metrics' && parts.length === 2 && method === 'GET') {
    return sendJson(response, 200, await service.getMetrics(scopedUserId))
  }
  if (parts[1] === 'sessions' && parts.length === 2 && method === 'GET') {
    return sendJson(response, 200, { sessions: await service.listSessions(scopedUserId) })
  }
  if (parts[1] === 'activity' && parts.length === 2 && method === 'GET') {
    return sendJson(response, 200, { activity: await service.listActivity(scopedUserId) })
  }

  // Users
  if (parts[1] === 'users' && parts.length === 2 && method === 'GET') {
    requireCurrentAdmin(user)
    return sendJson(response, 200, { users: await service.listUsers() })
  }
  if (parts[1] === 'users' && parts.length === 2 && method === 'POST') {
    requireCurrentAdmin(user)
    const input = userCreateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_USER', 'User fields are invalid')
    if (input.data.role === 'admin' && user.role !== 'admin') {
      throw new HttpError(403, 'ADMIN_REQUIRED', 'Only an administrator can create administrators')
    }
    try {
      return sendJson(response, 201, { user: await service.createUser(user.id, input.data) })
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }
  if (parts[1] === 'users' && parts.length === 3 && method === 'PATCH') {
    requireCurrentAdmin(user)
    const input = userUpdateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_USER', 'User fields are invalid')
    try {
      return sendJson(response, 200, { user: await service.updateUser(user.id, routeUuid(parts[2], 'INVALID_USER_ID'), input.data) })
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }
  if (parts[1] === 'users' && parts.length === 4 && parts[3] === 'reset-password' && method === 'POST') {
    requireCurrentAdmin(user)
    const input = userPasswordResetSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_PASSWORD', 'Password must be at least 12 characters')
    try {
      await service.resetUserPassword(user.id, routeUuid(parts[2], 'INVALID_USER_ID'), input.data.password)
      return sendJson(response, 200, { success: true })
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }

  // Assignments
  if (parts[1] === 'assignments' && parts.length === 2 && method === 'GET') {
    requireCurrentAdmin(user)
    return sendJson(response, 200, { assignments: await service.listAssignments() })
  }
  if (parts[1] === 'assignments' && parts.length === 2 && method === 'POST') {
    requireCurrentAdmin(user)
    const input = assignmentSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_ASSIGNMENT', 'Assignment fields are invalid')
    if (input.data.expiresAt && new Date(input.data.expiresAt).getTime() <= Date.now()) {
      throw new HttpError(400, 'INVALID_ASSIGNMENT', 'Assignment expiry must be in the future')
    }
    const assignmentId = await service.addAssignment(user.id, input.data.accountId, input.data.userId, input.data.expiresAt ?? null)
    return sendJson(response, 201, { assignmentId })
  }
  if (parts[1] === 'assignments' && parts.length === 4 && method === 'DELETE') {
    requireCurrentAdmin(user)
    await service.revokeAssignment(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'), routeUuid(parts[3], 'INVALID_USER_ID'))
    return sendJson(response, 200, { success: true })
  }

  // Audit Logs
  if (parts[1] === 'audit' && parts.length === 2 && method === 'GET') {
    requireCurrentAdmin(user)
    const limit = queryInteger(url.searchParams.get('limit'), 100, 1, 100)
    const offset = queryInteger(url.searchParams.get('offset'), 0, 0, 1_000_000)
    const page = await service.listAudit(limit + 1, offset)
    return sendJson(response, 200, { audit: page.slice(0, limit), pagination: { limit, offset, hasMore: page.length > limit } })
  }

  throw new HttpError(404, 'NOT_FOUND')
}
