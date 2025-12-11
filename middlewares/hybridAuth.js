import jwt from 'jsonwebtoken'
import { UserModel } from '../models/UserModel.js'
import { env } from '../config/env.js'

/**
 * Hybrid authentication middleware that accepts:
 * 1. JWT Bearer token (Authorization: Bearer <token>)
 * 2. app_id/app_secret headers
 * 
 * Sets req.user with decoded token data or user data from app_id lookup
 */
export async function hybridAuth(req, res, next) {
    try {
        // Try JWT first
        const authHeader = req.headers.authorization || ''
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

        if (token) {
            try {
                const decoded = jwt.verify(token, env.JWT_USER_SECRET)
                req.user = decoded
                return next()
            } catch (err) {
                // JWT invalid, try app_id/app_secret
                console.log('[hybridAuth] JWT verification failed, trying app_id/app_secret')
            }
        }

        // Try app_id/app_secret
        const appId = req.headers.app_id || req.headers['app-id'] || req.headers.App_id || req.headers['App-Id']
        const appSecret = req.headers.app_secret || req.headers['app-secret'] || req.headers.App_secret || req.headers['App-Secret']

        if (appId && appSecret) {
            // Find user by app_id
            const user = await UserModel.findByAppId(String(appId))

            if (!user) {
                return res.status(401).json({
                    ok: false,
                    error: 'Unauthorized',
                    message: 'app_id inválido.'
                })
            }

            // Verify app_secret (assuming it's stored in user.client_secret or user.app_secret_hash)
            const storedSecret = user.client_secret || user.app_secret_hash
            if (storedSecret !== String(appSecret)) {
                return res.status(401).json({
                    ok: false,
                    error: 'Unauthorized',
                    message: 'app_secret inválido.'
                })
            }

            // Set req.user with user data
            req.user = {
                id: user.id,
                userId: user.id,
                appId: user.app_id,
                email: user.email
            }
            return next()
        }

        // No valid authentication found
        return res.status(401).json({
            ok: false,
            error: 'Unauthorized',
            message: 'Token ou app_id/app_secret ausente.'
        })
    } catch (err) {
        console.error('[hybridAuth] Error:', err)
        return res.status(401).json({
            ok: false,
            error: 'Unauthorized',
            message: 'Erro na autenticação.'
        })
    }
}
