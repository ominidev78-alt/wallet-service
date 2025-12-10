import { pool } from '../config/db.js'

export class TwoFactorAuthModel {
  static async findByUserId(userId) {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM user_two_factor_auth
      WHERE user_id = $1
      LIMIT 1;
      `,
      [userId]
    )

    return rows[0] || null
  }

  static async create({ userId, secret, method = 'TOTP' }) {
    const { rows } = await pool.query(
      `
      INSERT INTO user_two_factor_auth (user_id, secret, method, enabled)
      VALUES ($1, $2, $3, false)
      ON CONFLICT (user_id, method)
      DO UPDATE SET
        secret = EXCLUDED.secret,
        enabled = false,
        updated_at = NOW()
      RETURNING *;
      `,
      [userId, secret, method]
    )

    return rows[0]
  }

  static async enable(userId, method = 'TOTP') {
    const { rows } = await pool.query(
      `
      UPDATE user_two_factor_auth
      SET enabled = true, updated_at = NOW()
      WHERE user_id = $1 AND method = $2
      RETURNING *;
      `,
      [userId, method]
    )

    return rows[0]
  }

  static async disable(userId, method = 'TOTP') {
    const { rows } = await pool.query(
      `
      UPDATE user_two_factor_auth
      SET enabled = false, updated_at = NOW()
      WHERE user_id = $1 AND method = $2
      RETURNING *;
      `,
      [userId, method]
    )

    return rows[0]
  }
}
