import { pool } from '../config/db.js'

export class WebhookLogModel {
  static async insert({ event_type, transaction_id, target_url, http_status = null, latency_ms = null, status = null, payload = null, response_body = null, error = null }) {
    const txId = transaction_id || null
    const jsonPayload = payload ? JSON.stringify(payload) : null

    try {
      const { rows } = await pool.query(
        `INSERT INTO webhook_logs (
           event_type, transaction_id, target_url, http_status,
           latency_ms, status, payload, response_body, error
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         RETURNING id, created_at`,
        [event_type || null, txId, target_url, http_status, latency_ms, status || null, jsonPayload, response_body || null, error || null]
      )
      return rows[0]
    } catch (e) {
      const { rows } = await pool.query(
        `INSERT INTO webhook_logs (
           event_type, transaction_id, target_url, http_status,
           latency_ms, status, payload, response_body, error
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         RETURNING id, created_at`,
        [event_type || null, txId, target_url, http_status, latency_ms, status || null, jsonPayload, response_body || null, error || null]
      )
      return rows[0]
    }
  }

  static async appendRetry(parentId, { http_status = null, latency_ms = null, response_body = null, error = null }) {
    const parent = await pool.query(
      `SELECT event_type, transaction_id, target_url, payload
       FROM webhook_logs WHERE id = $1`,
      [parentId]
    )
    const p = parent.rows[0]
    if (!p) return null

    const status =
      http_status != null
        ? http_status >= 200 && http_status < 300 ? 'delivered' : 'failed'
        : null

    return this.insert({
      event_type: p.event_type,
      transaction_id: p.transaction_id,
      target_url: p.target_url,
      http_status,
      latency_ms,
      status,
      payload: p.payload,
      response_body,
      error
    })
  }

  static async search({ dateFrom, dateTo, type, status, url, userId, transactionId, limit = 10, offset = 0 }) {
    const where = []
    const params = []

    if (dateFrom) { params.push(dateFrom); where.push(`created_at >= $${params.length}`) }
    if (dateTo) { params.push(dateTo); where.push(`created_at <= $${params.length}`) }
    if (type) { params.push(type); where.push(`event_type = $${params.length}`) }
    if (status) { params.push(status); where.push(`status = $${params.length}`) }
    if (userId) { params.push(userId); where.push(`(payload->>'userId')::int = $${params.length}`) }
    if (url) { params.push(`%${url}%`); where.push(`target_url ILIKE $${params.length}`) }
    if (transactionId) {
      params.push(transactionId)
      where.push(`transaction_id = $${params.length}`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    params.push(limit)
    const limitIdx = params.length

    params.push(offset)
    const offsetIdx = params.length

    const { rows } = await pool.query(
      `SELECT 
         id, created_at, http_status, latency_ms, target_url,
         event_type, status, transaction_id, payload
       FROM webhook_logs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    )

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM webhook_logs ${whereSql}`,
      params.slice(0, params.length - 2)
    )

    return { rows, total: countRes.rows[0]?.total ?? 0 }
  }

  static async findByIds(ids = []) {
    if (!ids.length) return []
    const { rows } = await pool.query(
      `SELECT 
         id, created_at, http_status, latency_ms, target_url,
         event_type, status, transaction_id, payload
       FROM webhook_logs
       WHERE id = ANY($1::int[])`,
      [ids]
    )
    return rows
  }
}
