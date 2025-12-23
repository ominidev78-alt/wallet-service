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

  /**
   * Busca a transação original no ledger usando merOrderNo ou externalId
   * @param {number} walletId - ID da wallet
   * @param {string} merOrderNo - Número do pedido do merchant
   * @param {string} externalId - External ID da transação
   * @returns {Promise<object|null>} - Dados da transação original ou null
   */
  static async findOriginalTransaction(walletId, merOrderNo, externalId) {
    const conditions = []
    const params = [walletId]
    let paramIndex = 2

    if (merOrderNo) {
      conditions.push(`meta->>'merOrderNo' = $${paramIndex}`)
      params.push(merOrderNo)
      paramIndex++
    }

    if (externalId) {
      conditions.push(`external_id = $${paramIndex}`)
      params.push(externalId)
      paramIndex++
    }

    if (conditions.length === 0) {
      return null
    }

    const whereClause = conditions.join(' OR ')

    const { rows } = await pool.query(
      `
      SELECT 
        id,
        external_id,
        meta,
        amount,
        direction,
        created_at
      FROM ledger_entries
      WHERE wallet_id = $1
        AND (${whereClause})
        AND direction = 'CREDIT'
      ORDER BY id ASC
      LIMIT 1;
      `,
      params
    )

    if (rows.length === 0) {
      return null
    }

    const entry = rows[0]
    const meta = typeof entry.meta === 'string' ? JSON.parse(entry.meta) : entry.meta

    return {
      externalId: entry.external_id,
      merOrderNo: meta?.merOrderNo || merOrderNo,
      orderNo: meta?.orderNo || externalId,
      tradeNo: meta?.tradeNo || meta?.e2e || merOrderNo,
      amount: entry.amount,
      meta
    }
  }

  /**
   * Atualiza os metadados de uma entrada do ledger
   * @param {number} walletId
   * @param {string} externalId
   * @param {object} newMeta
   * @returns {Promise<boolean>}
   */
  static async updateMeta(walletId, externalId, newMeta) {
    const { rowCount } = await pool.query(
      `
      UPDATE ledger_entries
      SET meta = meta || $3::jsonb
      WHERE wallet_id = $1 AND external_id = $2;
      `,
      [walletId, externalId, JSON.stringify(newMeta)]
    )
    return rowCount > 0
  }
}
