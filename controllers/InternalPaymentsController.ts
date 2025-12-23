import { Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import crypto from 'crypto'
import { WalletModel } from '../models/WalletModel.js'
import { LedgerModel } from '../models/LedgerModel.js'
import { HttpError } from '../core/HttpError.js'
import { env } from '../config/env.js'
import { userService } from '../app.js'

const paymentSchema = Joi.object({
  userId: Joi.alternatives()
    .try(
      Joi.number().integer().positive(),
      Joi.string().pattern(/^\d+$/).min(1)
    )
    .required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().default('BRL'),
  merOrderNo: Joi.string().allow('', null),
  providerOrderNo: Joi.string().allow('', null),
  provider: Joi.string().allow('', null),
  houseAmount: Joi.number().min(0).default(0),
  externalId: Joi.string().required()
})

class InternalPaymentsController {
  async creditHouseWallet({ currency, houseAmount, userId, type, provider, merOrderNo, providerOrderNo, externalId }: { currency: string, houseAmount: number, userId: number | string, type: string, provider?: string | null, merOrderNo?: string | null, providerOrderNo?: string | null, externalId?: string | null }): Promise<void> {
    const houseUserId = Number(env.HOUSE_USER_ID || 1)
    if (!houseUserId || houseUserId <= 0) return
    if (!houseAmount || houseAmount <= 0) return

    const houseWallet = await WalletModel.getOrCreateHouseWallet(houseUserId, currency)
    if (!houseWallet) return

    const houseExternalId = externalId
      ? `${externalId}-fee-${type.toLowerCase()}`
      : `${merOrderNo || 'house'}-fee-${crypto.randomUUID()}`

    await WalletModel.credit(houseWallet.id, {
      amount: houseAmount,
      description: `Taxa - ${type} - User ${userId}`,
      meta: { transactionType: type === 'DEPOSIT' ? 'PIX_IN_FEE' : 'PIX_OUT_FEE', userId, merOrderNo, providerOrderNo, provider },
      externalId: houseExternalId
    })
  }

  async applySplit(req: Request, res: Response, next: NextFunction) {
    try {
      const { value, error } = paymentSchema.validate({ ...req.body, externalId: req.body.external_id || req.body.externalId }, { abortEarly: false })
      if (error) throw new HttpError(400, 'ValidationError', { details: error.details })

      const { userId, amount: originalAmount, currency } = value
      let wallet = await WalletModel.getUserWallet(userId, currency)
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, currency)

      const alreadyProcessed = await LedgerModel.isTransactionProcessed(wallet.id, value.merOrderNo, value.providerOrderNo, value.externalId)
      if (alreadyProcessed) return res.json({ ok: true, message: 'Already processed', balance: Number(wallet.balance) })

      let houseAmount = Number(value.houseAmount || 0)
      if (houseAmount <= 0) {
        let fees: any = {}
        try {
          const feeResp = await userService.get(`internal/users/${userId}/fees`).json<any>()
          fees = feeResp.data || feeResp
        } catch (fErr: any) {
          console.warn(`[InternalPayments] Could not fetch fees for user ${userId}:`, fErr.message)
        }
        houseAmount = fees.pix_in_fee_type === 'FIXED'
          ? Number(fees.pix_in_fee_value || 0)
          : Number(((originalAmount * (fees.pix_in_percent || 0)) / 100).toFixed(2))
      }

      const netAmount = Number((originalAmount - houseAmount).toFixed(2))
      const newBalance = await WalletModel.updateBalance(wallet.id, Number((Number(wallet.balance) + netAmount).toFixed(2)))

      await LedgerModel.addEntry({
        walletId: wallet.id,
        direction: 'CREDIT',
        amount: originalAmount,
        description: 'Depósito Pix',
        meta: { ...value, netAmount, houseAmount, type: 'DEPOSIT' },
        externalId: value.externalId
      })

      if (houseAmount > 0) {
        await LedgerModel.addEntry({
          walletId: wallet.id,
          direction: 'DEBIT',
          amount: houseAmount,
          description: 'Taxa administrativa',
          meta: { parentExternalId: value.externalId, type: 'FEE' },
          externalId: `FEE_${value.externalId}`
        })
        await this.creditHouseWallet({ currency, houseAmount, userId, type: 'DEPOSIT', externalId: value.externalId })
      }

      return res.json({ ok: true, balance: newBalance.balance })
    } catch (err) {
      next(err)
    }
  }

  async applyWithdraw(req: Request, res: Response, next: NextFunction) {
    try {
      const { value, error } = paymentSchema.validate({ ...req.body, externalId: req.body.external_id || req.body.externalId }, { abortEarly: false })
      if (error) throw new HttpError(400, 'ValidationError', { details: error.details })

      const { userId, amount, currency } = value
      let wallet = await WalletModel.getUserWallet(userId, currency)
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, currency)

      const alreadyProcessed = await LedgerModel.isTransactionProcessed(wallet.id, value.merOrderNo, value.providerOrderNo, value.externalId)
      if (alreadyProcessed) return res.json({ ok: true, message: 'Already processed', balance: Number(wallet.balance) })

      let houseAmount = Number(value.houseAmount || 0)
      if (houseAmount <= 0) {
        let fees: any = {}
        try {
          const feeResp = await userService.get(`internal/users/${userId}/fees`).json<any>()
          fees = feeResp.data || feeResp
        } catch (fErr: any) {
          console.warn(`[InternalPayments] Could not fetch fees for user ${userId}:`, fErr.message)
        }
        houseAmount = fees.pix_out_fee_type === 'FIXED'
          ? Number(fees.pix_out_fee_value || 0)
          : Number(((amount * (fees.pix_out_percent || 0)) / 100).toFixed(2))
      }

      const totalAmount = amount + houseAmount
      if (Number(wallet.balance) < totalAmount) throw new HttpError(400, 'InsufficientBalance')

      const newBalance = await WalletModel.updateBalance(wallet.id, Number((Number(wallet.balance) - totalAmount).toFixed(2)))

      await LedgerModel.addEntry({
        walletId: wallet.id,
        direction: 'DEBIT',
        amount: amount,
        description: 'Saque Pix',
        meta: { ...value, totalAmount, houseAmount, type: 'WITHDRAW' },
        externalId: value.externalId
      })

      if (houseAmount > 0) {
        await LedgerModel.addEntry({
          walletId: wallet.id,
          direction: 'DEBIT',
          amount: houseAmount,
          description: 'Taxa administrativa',
          meta: { parentExternalId: value.externalId, type: 'FEE' },
          externalId: `${value.externalId}-fee`
        })
        await this.creditHouseWallet({ currency, houseAmount, userId, type: 'WITHDRAW', externalId: value.externalId })
      }

      return res.json({ ok: true, balance: newBalance.balance })
    } catch (err) {
      next(err)
    }
  }
}

export const internalPaymentsController = new InternalPaymentsController()