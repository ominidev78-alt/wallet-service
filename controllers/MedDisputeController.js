import Joi from 'joi'
import { MedDisputeModel } from '../models/MedDisputeModel.js'
import { WalletModel } from '../models/WalletModel.js'
import { UserModel } from '../models/UserModel.js'
import { HttpError } from '../core/HttpError.js'

const listSchema = Joi.object({
  status: Joi.string().valid('ALL', 'OPEN', 'UNDER_REVIEW', 'DEFENSE_SENT', 'REFUND_ACCEPTED', 'REFUND_REJECTED', 'EXPIRED', 'CLOSED').default('OPEN'),
  search: Joi.string().allow('', null)
})

const defenseSchema = Joi.object({
  defenseText: Joi.string().min(10).required(),
  attachments: Joi.array()
    .items(
      Joi.object({
        url: Joi.string().uri().required(),
        filename: Joi.string().allow('', null),
        mimeType: Joi.string().allow('', null)
      })
    )
    .default([])
})

const actionSchema = Joi.object({
  action: Joi.string().valid('ACCEPT_REFUND', 'REJECT_REFUND', 'MARK_UNDER_REVIEW').required(),
  note: Joi.string().allow('', null),
  amount: Joi.number().positive().allow(null)
})

export class MedDisputeController {
  async list(req, res, next) {
    try {
      const { value, error } = listSchema.validate(req.query, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      const disputes = await MedDisputeModel.list(value)

      return res.json({
        ok: true,
        data: disputes
      })
    } catch (err) {
      next(err)
    }
  }

  async detail(req, res, next) {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const dispute = await MedDisputeModel.findById(id)
      if (!dispute) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      return res.json({
        ok: true,
        data: dispute
      })
    } catch (err) {
      next(err)
    }
  }

  async attachments(req, res, next) {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const dispute = await MedDisputeModel.findById(id)
      if (!dispute) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      return res.json({
        ok: true,
        data: dispute.attachments || []
      })
    } catch (err) {
      next(err)
    }
  }

  async user(req, res, next) {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const dispute = await MedDisputeModel.findById(id)
      if (!dispute) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      if (!dispute.user_id) {
        throw new HttpError(400, 'MedDisputeWithoutUser')
      }

      const user = await UserModel.findById(dispute.user_id)
      if (!user) {
        throw new HttpError(404, 'UserNotFound')
      }

      const wallet = await WalletModel.getUserWallet(user.id, 'BRL')

      return res.json({
        ok: true,
        data: {
          user,
          wallet
        }
      })
    } catch (err) {
      next(err)
    }
  }

  async transaction(req, res, next) {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const dispute = await MedDisputeModel.findById(id)
      if (!dispute) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      return res.json({
        ok: true,
        data: {
          id: dispute.id,
          code: dispute.code,
          transactionId: dispute.transaction_id,
          userId: dispute.user_id,
          bankName: dispute.bank_name,
          bankCode: dispute.bank_code,
          disputedAmount: dispute.disputed_amount,
          status: dispute.status,
          reasonCode: dispute.reason_code,
          reasonLabel: dispute.reason_label,
          dueDate: dispute.due_date,
          providerPayload: dispute.provider_payload || null
        }
      })
    } catch (err) {
      next(err)
    }
  }

  async saveDefense(req, res, next) {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const { value, error } = defenseSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      const existing = await MedDisputeModel.findById(id)
      if (!existing) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      if (existing.status !== 'OPEN' && existing.status !== 'UNDER_REVIEW') {
        throw new HttpError(400, 'InvalidStatusForDefense')
      }

      await MedDisputeModel.saveDefense(id, value)

      return res.json({
        ok: true
      })
    } catch (err) {
      next(err)
    }
  }

  async summary(req, res, next) {
    try {
      const s = await MedDisputeModel.getSummary()

      const openCount = Number(s.open_count || 0)
      const blockedAmount = Number(s.blocked_amount || 0)
      const totalCount = Number(s.total_count || 0)

      return res.json({
        ok: true,
        data: {
          openCount,
          blockedAmount,
          totalCount,
          hasMed: totalCount > 0
        }
      })
    } catch (err) {
      next(err)
    }
  }

  async action(req, res, next) {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const { value, error } = actionSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      const dispute = await MedDisputeModel.findById(id)
      if (!dispute) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      if (value.action === 'MARK_UNDER_REVIEW') {
        const updated = await MedDisputeModel.updateStatus(id, {
          status: 'UNDER_REVIEW',
          resolutionNote: value.note || null
        })

        return res.json({
          ok: true,
          data: updated
        })
      }

      if (value.action === 'ACCEPT_REFUND') {
        const amount = value.amount || dispute.disputed_amount

        const wallet = await WalletModel.getUserWallet(dispute.user_id, 'BRL')
        if (!wallet) {
          throw new HttpError(400, 'WalletNotFound')
        }

        if (Number(wallet.balance) < Number(amount)) {
          throw new HttpError(400, 'InsufficientBalanceForRefund')
        }

        await WalletModel.debit(wallet.id, {
          direction: 'DEBIT',
          amount,
          description: `MED REFUND ${dispute.code}`,
          meta: {
            medId: dispute.id,
            transactionId: dispute.transaction_id,
            type: 'MED_REFUND'
          }
        })

        const updated = await MedDisputeModel.updateStatus(id, {
          status: 'REFUND_ACCEPTED',
          resolutionAmount: amount,
          resolutionStatus: 'REFUNDED',
          resolutionNote: value.note || null
        })

        return res.json({
          ok: true,
          data: updated
        })
      }

      if (value.action === 'REJECT_REFUND') {
        const updated = await MedDisputeModel.updateStatus(id, {
          status: 'REFUND_REJECTED',
          resolutionStatus: 'REJECTED',
          resolutionNote: value.note || null
        })

        return res.json({
          ok: true,
          data: updated
        })
      }

      throw new HttpError(400, 'UnknownAction')
    } catch (err) {
      next(err)
    }
  }

  // Métodos para usuários não-admin
  _getUserId(req) {
    const decoded = req.user || {}
    const rawId = decoded.id ?? decoded.Id ?? decoded.userId ?? decoded.sub ?? null
    const userId = Number(rawId)

    if (!Number.isFinite(userId) || userId <= 0) {
      throw new HttpError(401, 'Unauthorized', { message: 'Token inválido ou usuário não identificado.' })
    }

    return userId
  }

  async listMyDisputes(req, res, next) {
    try {
      const userId = this._getUserId(req)

      const { value, error } = listSchema.validate(req.query, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      const disputes = await MedDisputeModel.list({ ...value, userId })

      return res.json({
        ok: true,
        data: disputes
      })
    } catch (err) {
      next(err)
    }
  }

  async getMyDisputeDetail(req, res, next) {
    try {
      const userId = this._getUserId(req)
      const id = Number(req.params.id)

      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const dispute = await MedDisputeModel.findById(id)
      if (!dispute) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      // Verificar se a disputa pertence ao usuário
      if (dispute.user_id !== userId) {
        throw new HttpError(403, 'Forbidden', { message: 'Você não tem permissão para acessar esta disputa.' })
      }

      return res.json({
        ok: true,
        data: dispute
      })
    } catch (err) {
      next(err)
    }
  }

  async getMyDisputeAttachments(req, res, next) {
    try {
      const userId = this._getUserId(req)
      const id = Number(req.params.id)

      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const dispute = await MedDisputeModel.findById(id)
      if (!dispute) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      // Verificar se a disputa pertence ao usuário
      if (dispute.user_id !== userId) {
        throw new HttpError(403, 'Forbidden', { message: 'Você não tem permissão para acessar esta disputa.' })
      }

      return res.json({
        ok: true,
        data: dispute.attachments || []
      })
    } catch (err) {
      next(err)
    }
  }

  async getMyDisputeTransaction(req, res, next) {
    try {
      const userId = this._getUserId(req)
      const id = Number(req.params.id)

      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const dispute = await MedDisputeModel.findById(id)
      if (!dispute) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      // Verificar se a disputa pertence ao usuário
      if (dispute.user_id !== userId) {
        throw new HttpError(403, 'Forbidden', { message: 'Você não tem permissão para acessar esta disputa.' })
      }

      return res.json({
        ok: true,
        data: {
          id: dispute.id,
          code: dispute.code,
          transactionId: dispute.transaction_id,
          userId: dispute.user_id,
          bankName: dispute.bank_name,
          bankCode: dispute.bank_code,
          disputedAmount: dispute.disputed_amount,
          status: dispute.status,
          reasonCode: dispute.reason_code,
          reasonLabel: dispute.reason_label,
          dueDate: dispute.due_date,
          providerPayload: dispute.provider_payload || null
        }
      })
    } catch (err) {
      next(err)
    }
  }

  async saveMyDefense(req, res, next) {
    try {
      const userId = this._getUserId(req)
      const id = Number(req.params.id)

      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'InvalidId')
      }

      const { value, error } = defenseSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      const existing = await MedDisputeModel.findById(id)
      if (!existing) {
        throw new HttpError(404, 'MedDisputeNotFound')
      }

      // Verificar se a disputa pertence ao usuário
      if (existing.user_id !== userId) {
        throw new HttpError(403, 'Forbidden', { message: 'Você não tem permissão para acessar esta disputa.' })
      }

      if (existing.status !== 'OPEN' && existing.status !== 'UNDER_REVIEW') {
        throw new HttpError(400, 'InvalidStatusForDefense')
      }

      await MedDisputeModel.saveDefense(id, value)

      return res.json({
        ok: true
      })
    } catch (err) {
      next(err)
    }
  }

  async getMySummary(req, res, next) {
    try {
      const userId = this._getUserId(req)
      const s = await MedDisputeModel.getSummary(userId)

      const openCount = Number(s.open_count || 0)
      const blockedAmount = Number(s.blocked_amount || 0)
      const totalCount = Number(s.total_count || 0)

      return res.json({
        ok: true,
        data: {
          openCount,
          blockedAmount,
          totalCount,
          hasMed: totalCount > 0
        }
      })
    } catch (err) {
      next(err)
    }
  }
}

export const medDisputeController = new MedDisputeController()
