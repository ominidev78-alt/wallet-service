import { Request, Response, NextFunction } from 'express'
import { TwoFactorAuthModel } from '../models/TwoFactorAuthModel.js'
import { authService } from '../app.js'
import { TotpService } from '../TotpService.js'
import { HttpError } from '../core/HttpError.js'

export async function require2FA(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id || req.user?.userId
    if (!userId) {
      throw new HttpError(401, 'Unauthorized')
    }

    const config = await TwoFactorAuthModel.findByUserId(userId)
    if (!config || !config.enabled) {
      throw new HttpError(403, 'TwoFactorRequired', {
        message: '2FA é obrigatório para esta operação'
      })
    }

    const isLocked = await TwoFactorAuthModel.isLocked(userId)
    if (isLocked) {
      throw new HttpError(423, 'TwoFactorLocked', {
        message: '2FA está temporariamente bloqueado devido a múltiplas tentativas falhas'
      })
    }

    const code = req.body.code
    const recoveryCode = req.body.recoveryCode

    if (!code && !recoveryCode) {
      throw new HttpError(400, 'TwoFactorCodeRequired', {
        message: 'Código 2FA é obrigatório (code ou recoveryCode)'
      })
    }

    let isValid = false
    if (recoveryCode) {
      isValid = await TwoFactorAuthModel.verifyRecoveryCode(userId, recoveryCode)
    } else if (code) {
      isValid = TotpService.verifyToken(code, config.secret)
    }

    if (!isValid) {
      const failure = await TwoFactorAuthModel.recordFailure(userId)
      const ipAddress = (req.ip || req.headers['x-forwarded-for'] || null) as string | null
      const userAgent = (req.headers['user-agent'] || null) as string | null
      const context = req.path || 'UNKNOWN'

      await TwoFactorAuthModel.addAuditLog({
        userId,
        action: 'VERIFY_FAILED',
        method: 'TOTP',
        context,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Invalid code'
      })

      if (failure.locked) {
        throw new HttpError(423, 'TwoFactorLocked', {
          message: 'Muitas tentativas falhas. 2FA bloqueado temporariamente.'
        })
      }

      throw new HttpError(400, 'InvalidCode', {
        message: 'Código 2FA inválido',
        attemptsRemaining: 3 - failure.attempts
      })
    }

    await TwoFactorAuthModel.recordSuccess(userId)
    const ipAddress = (req.ip || req.headers['x-forwarded-for'] || null) as string | null
    const userAgent = (req.headers['user-agent'] || null) as string | null
    const context = req.path || 'UNKNOWN'

    await TwoFactorAuthModel.addAuditLog({
      userId,
      action: 'VERIFY_SUCCESS',
      method: 'TOTP',
      context,
      ipAddress,
      userAgent,
      success: true
    })

    delete req.body.code
    delete req.body.recoveryCode

    next()
  } catch (err) {
    return next(err)
  }
}