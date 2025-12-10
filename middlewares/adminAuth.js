import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

const JWT_ADMIN_SECRET = env.JWT_ADMIN_SECRET || 'mutual-admin-secret-2025'

export function adminAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      message: 'Token ausente.'
    })
  }

  try {
    const decoded = jwt.verify(token, JWT_ADMIN_SECRET)

    const role = decoded.role ? String(decoded.role).toUpperCase() : null

    if (role !== 'ADMIN') {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem acessar.'
      })
    }

    req.user = decoded
    return next()
  } catch (err) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      message: 'Token inválido ou expirado.'
    })
  }
}
