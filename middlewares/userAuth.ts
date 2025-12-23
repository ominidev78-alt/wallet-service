import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

const JWT_USER_SECRET = env.JWT_USER_SECRET || 'pagandu-secret-2025'

export function userAuth(req: Request, res: Response, next: NextFunction) {
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
    const decoded: any = jwt.verify(token, JWT_USER_SECRET)
    req.user = decoded
    return next()
  } catch (err: any) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      message: err.name === 'TokenExpiredError' ? 'Token expirado.' : 'Token inválido ou expirado.'
    })
  }
}