import Joi from 'joi'
import { UserFeeModel } from '../models/UserFeeModel.js'
import { UserModel } from '../models/UserModel.js'
import { HttpError } from '../core/HttpError.js'

const setFeesSchema = Joi.object({
  pixInPercent: Joi.number().min(0).max(100).optional().default(0),
  pixOutPercent: Joi.number().min(0).max(100).optional().default(0),
  pixInFeeType: Joi.string().valid('PERCENT', 'FIXED').optional().default('PERCENT'),
  pixInFeeValue: Joi.number().min(0).optional().default(0),
  pixOutFeeType: Joi.string().valid('PERCENT', 'FIXED').optional().default('PERCENT'),
  pixOutFeeValue: Joi.number().min(0).optional().default(0)
})

export class UserFeeController {
  async adminSetUserFees(req, res, next) {
    try {
      console.log('[adminSetUserFees] === INÍCIO ===')
      console.log('[adminSetUserFees] Parâmetros recebidos:', {
        userId: req.params.id,
        body: req.body
      })
      
      const userId = Number(req.params.id)
      if (!Number.isFinite(userId) || userId <= 0) {
        throw new HttpError(400, 'InvalidUserId')
      }

      const { value, error } = setFeesSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        console.error('[adminSetUserFees] ❌ Erro de validação:', error)
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      console.log('[adminSetUserFees] Valores validados:', value)

      const user = await UserModel.findById(userId)
      if (!user) {
        throw new HttpError(404, 'UserNotFound')
      }

      console.log('[adminSetUserFees] Usuário encontrado:', user.id)

      const feesRow = await UserFeeModel.upsertForUser(userId, {
        pixInPercent: Number(value.pixInPercent || 0),
        pixOutPercent: Number(value.pixOutPercent || 0),
        pixInFeeType: value.pixInFeeType || 'PERCENT',
        pixInFeeValue: Number(value.pixInFeeValue || 0),
        pixOutFeeType: value.pixOutFeeType || 'PERCENT',
        pixOutFeeValue: Number(value.pixOutFeeValue || 0)
      })

      console.log('[adminSetUserFees] Taxas salvas:', feesRow)

      const data = {
        userId,
        pixInPercent: Number(feesRow.pix_in_percent),
        pixOutPercent: Number(feesRow.pix_out_percent),
        pixInFeeType: feesRow.pix_in_fee_type || 'PERCENT',
        pixInFeeValue: Number(feesRow.pix_in_fee_value || 0),
        pixOutFeeType: feesRow.pix_out_fee_type || 'PERCENT',
        pixOutFeeValue: Number(feesRow.pix_out_fee_value || 0)
      }

      console.log('[adminSetUserFees] ✅ Retornando dados:', data)

      return res.json({
        ok: true,
        data
      })
    } catch (err) {
      console.error('[adminSetUserFees] ❌ Erro:', err)
      next(err)
    }
  }

  async adminGetUserFees(req, res, next) {
    try {
      const userId = Number(req.params.id)
      if (!Number.isFinite(userId) || userId <= 0) {
        throw new HttpError(400, 'InvalidUserId')
      }

      const user = await UserModel.findById(userId)
      if (!user) {
        throw new HttpError(404, 'UserNotFound')
      }

      const fees = await UserFeeModel.getByUserId(userId)

      if (!fees) {
        return res.json({
          ok: true,
          data: {
            userId,
            pixInPercent: 0,
            pixOutPercent: 0,
            pixInFeeType: 'PERCENT',
            pixInFeeValue: 0,
            pixOutFeeType: 'PERCENT',
            pixOutFeeValue: 0
          }
        })
      }

      return res.json({
        ok: true,
        data: {
          userId,
          pixInPercent: Number(fees.pix_in_percent),
          pixOutPercent: Number(fees.pix_out_percent),
          pixInFeeType: fees.pix_in_fee_type || 'PERCENT',
          pixInFeeValue: Number(fees.pix_in_fee_value || 0),
          pixOutFeeType: fees.pix_out_fee_type || 'PERCENT',
          pixOutFeeValue: Number(fees.pix_out_fee_value || 0)
        }
      })
    } catch (err) {
      next(err)
    }
  }

  
  async getMyFees(req, res, next) {
    try {
      console.log('[getMyFees] === INÍCIO ===')
      console.log('[getMyFees] Headers recebidos:', {
        authorization: req.headers.authorization ? 'Bearer ***' : 'ausente',
        'content-type': req.headers['content-type']
      })
      
      const decoded = req.user || {}
      console.log('[getMyFees] Token decodificado completo:', JSON.stringify(decoded, null, 2))
      
      const rawId =
        decoded.id ??
        decoded.Id ??
        decoded.userId ??
        decoded.sub ??
        null

      console.log('[getMyFees] Raw ID extraído:', rawId, 'Tipo:', typeof rawId)

      const userId = Number(rawId)
      console.log('[getMyFees] UserId convertido:', userId, 'É válido?', Number.isFinite(userId) && userId > 0)

      if (!Number.isFinite(userId) || userId <= 0) {
        console.error('[getMyFees] ❌ UserId inválido do token:', { rawId, userId, decoded })
        throw new HttpError(401, 'Unauthorized')
      }

      console.log('[getMyFees] Buscando taxas no banco para userId:', userId)
      const fees = await UserFeeModel.getByUserId(userId)
      console.log('[getMyFees] Resultado da query:', fees)

      if (!fees) {
        console.log('[getMyFees] ⚠️ Nenhuma taxa encontrada no banco para userId:', userId)
        return res.json({
          ok: true,
          data: {
            userId,
            pixInPercent: 0,
            pixOutPercent: 0,
            pixInFeeType: 'PERCENT',
            pixInFeeValue: 0,
            pixOutFeeType: 'PERCENT',
            pixOutFeeValue: 0
          }
        })
      }

      const responseData = {
        ok: true,
        data: {
          userId,
          pixInPercent: Number(fees.pix_in_percent),
          pixOutPercent: Number(fees.pix_out_percent),
          pixInFeeType: fees.pix_in_fee_type || 'PERCENT',
          pixInFeeValue: Number(fees.pix_in_fee_value || 0),
          pixOutFeeType: fees.pix_out_fee_type || 'PERCENT',
          pixOutFeeValue: Number(fees.pix_out_fee_value || 0)
        }
      }
      
      console.log('[getMyFees] ✅ Retornando taxas:', responseData)
      return res.json(responseData)
    } catch (err) {
      console.error('[getMyFees] ❌ ERRO:', err.message || err)
      console.error('[getMyFees] Stack:', err.stack)
      next(err)
    }
  }

  // Método interno para buscar taxas (usado pelo API Gateway)
  async internalGetUserFees(req, res, next) {
    try {
      const userId = Number(req.params.id)
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ ok: false, error: 'InvalidUserId' })
      }

      const fees = await UserFeeModel.getByUserId(userId)

      if (!fees) {
        return res.json({
          ok: true,
          data: {
            userId,
            pixInPercent: 0,
            pixOutPercent: 0,
            pixInFeeType: 'PERCENT',
            pixInFeeValue: 0,
            pixOutFeeType: 'PERCENT',
            pixOutFeeValue: 0
          }
        })
      }

      return res.json({
        ok: true,
        data: {
          userId,
          pixInPercent: Number(fees.pix_in_percent),
          pixOutPercent: Number(fees.pix_out_percent),
          pixInFeeType: fees.pix_in_fee_type || 'PERCENT',
          pixInFeeValue: Number(fees.pix_in_fee_value || 0),
          pixOutFeeType: fees.pix_out_fee_type || 'PERCENT',
          pixOutFeeValue: Number(fees.pix_out_fee_value || 0)
        }
      })
    } catch (err) {
      console.error('[internalGetUserFees] ❌ ERRO:', err.message || err)
      next(err)
    }
  }
}

export const userFeeController = new UserFeeController()

