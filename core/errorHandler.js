export function notFoundHandler(req, res, next) {
  return res.status(404).json({ ok: false, error: 'NotFound' })
}

export function globalErrorHandler(err, req, res, next) {
  console.error('[user-service ERROR]', err)
  if (res.headersSent) return

  const status = err.status || 500
  const payload = {
    ok: false,
    error: err.name || 'InternalError',
    message: err.message || 'Internal error'
  }

  if (err.extra) payload.details = err.extra

  return res.status(status).json(payload)
}
