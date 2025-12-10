import { WalletModel } from '../models/WalletModel.js'
import { HttpError } from '../core/HttpError.js'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'

class AdminTreasuryController {

  async getHouseWallet(currency) {
    const finalCurrency = (currency || 'BRL').toUpperCase()

    const houseUserId = env.HOUSE_USER_ID ? parseInt(env.HOUSE_USER_ID, 10) : null

    if (!houseUserId) {
      throw new HttpError(500, 'HouseUserNotConfigured', {
        message: 'Configure HOUSE_USER_ID no .env'
      })
    }

    const wallet = await WalletModel.getOrCreateHouseWallet(houseUserId, finalCurrency)

    if (!wallet) {
      throw new HttpError(500, 'HouseWalletNotFound', {
        message: 'Não foi possível criar ou recuperar a wallet HOUSE'
      })
    }

    return wallet
  }

  async balance(req, res) {
    try {
      const wallet = await this.getHouseWallet(req.query.currency)

      return res.json({
        ok: true,
        data: {
          walletId: wallet.id,
          userId: wallet.user_id,
          currency: wallet.currency,
          balance: wallet.balance
        }
      })
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        error: err.code,
        message: err.message
      })
    }
  }

  async ledger(req, res) {
    try {
      const wallet = await this.getHouseWallet(req.query.currency)

      let limit = Number(req.query.limit || 100)
      if (!Number.isFinite(limit) || limit <= 0 || limit > 1000) limit = 100

      const params = [wallet.id]
      let where = 'wallet_id = $1'

      if (req.query.from) {
        params.push(req.query.from)
        where += ` AND created_at >= $${params.length}`
      }

      if (req.query.to) {
        params.push(req.query.to)
        where += ` AND created_at <= $${params.length}`
      }

      params.push(limit)

      const query = `
        SELECT
          id,
          wallet_id,
          direction,
          amount,
          description,
          meta,
          created_at
        FROM ledger_entries
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length}
      `

      const { rows } = await pool.query(query, params)

      const items = rows.map(r => ({
        id: r.id,
        wallet_id: r.wallet_id,
        type: r.direction,
        amount: Number(r.amount),
        description: r.description,
        created_at: r.created_at,
        meta: typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta
      }))

      return res.json({ ok: true, data: items })
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        error: err.code,
        message: err.message
      })
    }
  }

  async summaryDaily(req, res) {
    try {
      const wallet = await this.getHouseWallet(req.query.currency)

      const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString()
      const to = req.query.to || new Date().toISOString()

      const query = `
        SELECT
          date_trunc('day', created_at)::date AS date,
          SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS total_in,
          SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS total_out,
          COUNT(*) AS operations
        FROM ledger_entries
        WHERE wallet_id = $1
          AND created_at BETWEEN $2 AND $3
        GROUP BY 1
        ORDER BY 1 DESC
      `

      const { rows } = await pool.query(query, [wallet.id, from, to])

      const items = rows.map(r => ({
        date: r.date.toISOString().split('T')[0],
        total_in: Number(r.total_in),
        total_out: Number(r.total_out),
        net_amount: Number(r.total_in) - Number(r.total_out),
        operations: Number(r.operations)
      }))

      return res.json({ ok: true, data: items })
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        error: err.code,
        message: err.message
      })
    }
  }

  async summaryMonthly(req, res) {
    try {
      const wallet = await this.getHouseWallet(req.query.currency)

      const now = new Date()
      const from = req.query.from || new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()
      const to = req.query.to || now.toISOString()

      const query = `
        SELECT
          date_trunc('month', created_at)::date AS date,
          SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS total_in,
          SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS total_out,
          COUNT(*) AS operations
        FROM ledger_entries
        WHERE wallet_id = $1
          AND created_at BETWEEN $2 AND $3
        GROUP BY 1
        ORDER BY 1 DESC
      `

      const { rows } = await pool.query(query, [wallet.id, from, to])

      const items = rows.map(r => ({
        date: r.date.toISOString().substring(0, 7),
        total_in: Number(r.total_in),
        total_out: Number(r.total_out),
        net_amount: Number(r.total_in) - Number(r.total_out),
        operations: Number(r.operations)
      }))

      return res.json({ ok: true, data: items })
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        error: err.code,
        message: err.message
      })
    }
  }
}

export const adminTreasuryController = new AdminTreasuryController()
