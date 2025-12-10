import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

const JWT_USER_SECRET =
  env.JWT_USER_SECRET || env.JWT_OPERATOR_SECRET || 'mutual-secret-2025'

export function userAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    console.log('[userAuth] Token ausente. Header Authorization:', header ? 'presente' : 'ausente')
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      message: 'Token ausente.'
    })
  }

  try {
    const decoded = jwt.verify(token, JWT_USER_SECRET)
    req.user = decoded
    return next()
  } catch (err) {
    console.log('[userAuth] Erro ao verificar token:', err.message)
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      message: err.name === 'TokenExpiredError' ? 'Token expirado.' : 'Token inválido ou expirado.'
    })
  }
}
