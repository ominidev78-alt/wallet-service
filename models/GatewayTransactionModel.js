import { pool } from '../config/db.js'

export class GatewayTransactionModel {
  static async findByExternalId(externalId) {
    const { rows } = await pool.query(
      `SELECT * FROM gateway_transactions WHERE raw_pagandu->>'externalId' = $1 LIMIT 1`,
      [externalId]
    )
    return rows[0] || null
  }

  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM gateway_transactions WHERE id = $1 LIMIT 1`,
      [id]
    )
    return rows[0] || null
  }


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
        obj?.payer?.document ||
        obj?.receiver?.document_number ||
        obj?.receiver?.document ||
        obj?.documentNumber ||
        obj?.payerDocument ||
        obj?.receiverDocument ||
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
        obj?.receiver?.name ||
        obj?.accountHolder?.name ||
        obj?.holder?.name ||
        obj?.payerName ||
        obj?.receiverName ||
        obj?.name ||
        null
      )
    } catch {
      return null
    }
  }

  static async updateById(id, data) {
    const fields = []
    const values = []
    let idx = 1

    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${idx}`)
      values.push(value)
      idx++
    }

    if (fields.length === 0) return null

    values.push(id)
    const query = `
      UPDATE gateway_transactions
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `

    const { rows } = await pool.query(query, values)
    return rows[0] || null
  }
}