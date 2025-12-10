import { pool } from '../config/db.js'

export class MedDisputeModel {
  static async createFromWebhook({
    transactionId,
    userId,
    bankName,
    bankCode,
    disputedAmount,
    reasonCode,
    reasonLabel,
    dueDate,
    providerPayload
  }) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const codeResult = await client.query(
        `
        SELECT CONCAT('MED-', TO_CHAR(NOW(), 'YYYY'), '-', LPAD((COUNT(*) + 1)::text, 3, '0')) AS code
        FROM med_disputes
        WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
        `
      )

      const code = codeResult.rows[0].code

      const insert = await client.query(
        `
        INSERT INTO med_disputes
          (code, transaction_id, user_id, bank_name, bank_code, disputed_amount, reason_code, reason_label, status, due_date, provider_payload)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', $9, $10::jsonb)
        RETURNING *
        `,
        [
          code,
          transactionId,
          userId,
          bankName || null,
          bankCode || null,
          disputedAmount,
          reasonCode,
          reasonLabel || null,
          dueDate || null,
          JSON.stringify(providerPayload || {})
        ]
      )

      await client.query('COMMIT')
      return insert.rows[0]
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  static async list({ status, search, userId }) {
    const values = []
    const where = []

    if (status && status !== 'ALL') {
      values.push(status)
      where.push(`d.status = $${values.length}`)
    }

    if (search) {
      values.push(`%${search}%`)
      where.push(
        `(d.code ILIKE $${values.length} OR CAST(d.transaction_id AS TEXT) ILIKE $${values.length})`
      )
    }

    if (userId) {
      values.push(userId)
      where.push(`d.user_id = $${values.length}`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const { rows } = await pool.query(
      `
      SELECT
        d.id,
        d.code,
        d.transaction_id,
        d.user_id,
        d.bank_name,
        d.bank_code,
        d.disputed_amount,
        d.reason_code,
        d.reason_label,
        d.status,
        d.due_date,
        d.created_at,
        d.updated_at
      FROM med_disputes d
      ${whereSql}
      ORDER BY d.created_at DESC
      LIMIT 100
      `,
      values
    )

    return rows
  }

  static async findById(id) {
    const { rows } = await pool.query(
      `
      SELECT
        d.*,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', a.id,
                'url', a.url,
                'filename', a.filename,
                'mimeType', a.mime_type,
                'createdAt', a.created_at
              )
            )
            FROM med_dispute_attachments a
            WHERE a.med_id = d.id
          ),
          '[]'::json
        ) AS attachments
      FROM med_disputes d
      WHERE d.id = $1
      LIMIT 1
      `,
      [id]
    )

    return rows[0] || null
  }

  static async saveDefense(id, { defenseText, attachments }) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      await client.query(
        `
        UPDATE med_disputes
        SET
          defense_text = $2,
          defense_sent_at = NOW(),
          status = 'DEFENSE_SENT',
          updated_at = NOW()
        WHERE id = $1
        `,
        [id, defenseText || null]
      )

      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          await client.query(
            `
            INSERT INTO med_dispute_attachments
              (med_id, url, filename, mime_type)
            VALUES
              ($1, $2, $3, $4)
            `,
            [
              id,
              att.url,
              att.filename || null,
              att.mimeType || att.mime_type || null
            ]
          )
        }
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
  static async getSummary(userId = null) {
    const values = []
    const where = []

    if (userId) {
      values.push(userId)
      where.push(`user_id = $1`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const { rows } = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('OPEN','UNDER_REVIEW','DEFENSE_SENT')) AS open_count,
        COALESCE(
          SUM(disputed_amount) FILTER (WHERE status IN ('OPEN','UNDER_REVIEW','DEFENSE_SENT')),
          0
        ) AS blocked_amount,
        COUNT(*) AS total_count
      FROM med_disputes
      ${whereSql}
      `,
      values
    )

    return rows[0]
  }

  static async updateStatus(id, { status, resolutionAmount, resolutionStatus, resolutionNote }) {
    const { rows } = await pool.query(
      `
      UPDATE med_disputes
      SET
        status = $2,
        resolution = COALESCE($3, resolution),
        resolution_status = COALESCE($4, resolution_status),
        resolution_note = COALESCE($5, resolution_note),
        resolution_at = CASE WHEN $3 IS NOT NULL OR $4 IS NOT NULL THEN NOW() ELSE resolution_at END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id, status, resolutionAmount || null, resolutionStatus || null, resolutionNote || null]
    )

    return rows[0] || null
  }
}
