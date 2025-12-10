import { pool } from '../config/db.js'

export class GatewayTransactionModel {
  static async findByMerOrderNo(merOrderNo) {
    const { rows } = await pool.query(
      `SELECT * FROM gateway_transactions WHERE mer_order_no = $1 LIMIT 1`,
      [merOrderNo]
    )
    return rows[0] || null
  }

  static async findByTradeNo(tradeNo) {
    if (!tradeNo) return null
    const { rows } = await pool.query(
      `SELECT * FROM gateway_transactions WHERE trade_no = $1 LIMIT 1`,
      [tradeNo]
    )
    return rows[0] || null
  }

  static extractDocumentFromRaw(raw) {
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
      return (
        obj?.payer?.document_number ||
        obj?.document ||
        null
      )
    } catch {
      return null
    }
  }

  static extractNameFromRaw(raw) {
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
      return (
        obj?.payer?.name ||
        obj?.accountHolder?.name ||
        obj?.holder?.name ||
        null
      )
    } catch {
      return null
    }
  }
}