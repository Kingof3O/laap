export class ServiceError extends Error {
  constructor(readonly code: string, readonly status: number, message = code) {
    super(message)
  }
}
