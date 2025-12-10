import { pool } from '../config/db.js'

export class LedgerModel {
  static async addEntry({ walletId, direction, amount, description, meta, externalId }) {
    if (!externalId) {
      throw new Error('external_id is required for ledger entries')
    }

    const { rows } = await pool.query(
      `
      INSERT INTO ledger_entries (
        wallet_id,
        direction,
        amount,
        description,
        meta,
        external_id,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6,
        NOW()
      )
      RETURNING *;
      `,
      [
        walletId,
        direction,
        amount,
        description || null,
        JSON.stringify(meta || {}),
        externalId
      ]
    )

    return rows[0]
  }

  static async getWalletEntries(walletId, limit = 100) {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        wallet_id,
        direction,
        amount,
        description,
        meta,
        external_id,
        created_at
      FROM ledger_entries
      WHERE wallet_id = $1
      ORDER BY id DESC
      LIMIT $2;
      `,
      [walletId, limit]
    )

    return rows
  }

  static async getWalletSummary(walletId) {
    const { rows } = await pool.query(
      `
      SELECT
        SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS total_credit,
        SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS total_debit
      FROM ledger_entries
      WHERE wallet_id = $1;
      `,
      [walletId]
    )

    return rows[0]
  }

  static async findById(entryId) {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM ledger_entries
      WHERE id = $1
      LIMIT 1;
      `,
      [entryId]
    )

    return rows[0] || null
  }

  /**
   * Verifica se uma transação já foi processada
   * @param {number} walletId - ID da wallet
   * @param {string} merOrderNo - Número do pedido do merchant
   * @param {string} orderNo - Número do pedido do gateway
   * @param {string} tradeNo - Número da transação
   * @returns {Promise<boolean>} - true se já foi processada
   */
  static async isTransactionProcessed(walletId, merOrderNo, orderNo, tradeNo) {
    const conditions = []
    const params = [walletId]
    let paramIndex = 2

    if (merOrderNo) {
      conditions.push(`meta->>'merOrderNo' = $${paramIndex}`)
      params.push(merOrderNo)
      paramIndex++
    }

    if (orderNo) {
      conditions.push(`meta->>'orderNo' = $${paramIndex}`)
      params.push(orderNo)
      paramIndex++
    }

    if (tradeNo) {
      conditions.push(`(meta->>'tradeNo' = $${paramIndex} OR meta->>'e2e' = $${paramIndex})`)
      params.push(tradeNo)
      paramIndex++
    }

    if (conditions.length === 0) {
      return false
    }

    const whereClause = conditions.join(' OR ')

    const { rows } = await pool.query(
      `
      SELECT id
      FROM ledger_entries
      WHERE wallet_id = $1
        AND (${whereClause})
      LIMIT 1;
      `,
      params
    )

    return rows.length > 0
  }
}
