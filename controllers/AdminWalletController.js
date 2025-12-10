import Joi from 'joi'
import { pool } from '../config/db.js'
import { HttpError } from '../core/HttpError.js'

const adjustSchema = Joi.object({
  type: Joi.string().valid('CREDIT', 'DEBIT').required(),
  amount: Joi.number().positive().required(),
  description: Joi.string().allow('', null)
})

class AdminWalletController {
  async #getOrCreateUserWallet(userId, currencyParam) {
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new HttpError(400, 'InvalidUserId')
    }

    const currency = (currencyParam || 'BRL').toUpperCase()

    let wallet = await WalletModel.getUserWallet(userId, currency)
    if (!wallet) {
      wallet = await WalletModel.createUserWallet(userId, currency)
    }

    return wallet
  }

  async getUserWallet(req, res, next) {
    try {
      const userId = Number(req.params.id)
      const wallet = await this.#getOrCreateUserWallet(userId, req.query.currency)

      return res.json({
        ok: true,
        data: wallet
      })
    } catch (err) {
      next(err)
    }
  }

  async getUserLedger(req, res, next) {
    try {
      const userId = Number(req.params.id)
      const wallet = await this.#getOrCreateUserWallet(userId, req.query.currency)

      let limit = Number(req.query.limit || 100)
      if (!Number.isFinite(limit) || limit <= 0 || limit > 1000) {
        limit = 100
      }

      const from = req.query.from || null
      const to = req.query.to || null

      const params = [wallet.id]
      let where = 'wallet_id = $1'

      if (from) {
        params.push(from)
        where += ` AND created_at >= $${params.length}`
      }

      if (to) {
        params.push(to)
        where += ` AND created_at <= $${params.length}`
      }

      params.push(limit)

      const query = `
        SELECT
          id,
          wallet_id,
          direction AS type,
          amount,
          description,
          meta,
          created_at
        FROM wallet_ledger
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length}
      `

      const { rows } = await pool.query(query, params)

      return res.json({
        ok: true,
        data: rows
      })
    } catch (err) {
      next(err)
    }
  }

  async adjustBalance(req, res, next) {
    try {
      const userId = Number(req.params.id)

      const { value, error } = adjustSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      const wallet = await this.#getOrCreateUserWallet(userId, req.query.currency)

      const currentBalance = Number(wallet.balance || 0)
      const amount = Number(value.amount)

      let newBalance

      if (value.type === 'CREDIT') {
        newBalance = currentBalance + amount
      } else {
        if (currentBalance < amount) {
          throw new HttpError(400, 'InsufficientFunds', {
            message: 'Saldo insuficiente para débito'
          })
        }
        newBalance = currentBalance - amount
      }

      const updatedWallet = await WalletModel.updateBalance(wallet.id, newBalance)

      const description =
        value.description ||
        (value.type === 'CREDIT'
          ? 'Ajuste manual de crédito (admin)'
          : 'Ajuste manual de débito (admin)')

      const meta = {
        adminAdjustment: true,
        type: value.type
      }

      const insertLedgerQuery = `
        INSERT INTO wallet_ledger
          (wallet_id, direction, amount, description, meta)
        VALUES
          ($1, $2, $3, $4, $5::jsonb)
        RETURNING id, wallet_id, direction AS type, amount, description, meta, created_at
      `

      const { rows } = await pool.query(insertLedgerQuery, [
        wallet.id,
        value.type,
        amount,
        description,
        JSON.stringify(meta)
      ])

      const ledgerEntry = rows[0] || null

      return res.json({
        ok: true,
        data: {
          wallet: updatedWallet,
          ledgerEntry
        }
      })
    } catch (err) {
      next(err)
    }
  }
}

export const adminWalletController = new AdminWalletController()
