export function notFoundHandler(req, res, next) {
  res.status(404).json({
    ok: false,
    error: 'NotFound'
  })
}

export function globalErrorHandler(err, req, res, next) {
  console.error(err)

  const status = err.status || 500
  const message = err.message || 'InternalServerError'

  res.status(status).json({
    ok: false,
    error: message
  })
}
