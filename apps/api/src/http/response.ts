import type { ServerResponse } from 'node:http'
import { isHttpError } from './errors.js'

export function applySecurityHeaders(response: ServerResponse, allowedOrigin: string, secure = false) {
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  response.setHeader('Access-Control-Allow-Credentials', 'true')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-LAAP-Client')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  response.setHeader('Vary', 'Origin')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  if (secure) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

export function sendJson(response: ServerResponse, status: number, payload: unknown) {
  if (response.headersSent) return
  const body = JSON.stringify(payload)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.end(body)
}

export function sendError(response: ServerResponse, error: unknown, requestId?: string) {
  if (isHttpError(error)) return sendJson(response, error.status, { error: { code: error.code, message: error.message }, requestId })
  console.error(error)
  return sendJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' }, requestId })
}
