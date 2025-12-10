import { pool } from '../config/db.js'
import crypto from 'crypto'

export class UserModel {
  static async createOperator({
    name,
    email,
    document,
    externalId,
    cnpj,
    companyName,
    tradeName,
    partnerName,
    cnpjData,
    gatewayFeePercent,
    partnerFeePercent
  }) {
    const { rows } = await pool.query(
      `
      INSERT INTO users (
        name,
        email,
        document,
        external_id,
        cnpj,
        company_name,
        trade_name,
        partner_name,
        cnpj_data,
        doc_status,
        doc_status_notes,
        doc_status_updated_at,
        gateway_fee_percent,
        partner_fee_percent
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9::jsonb,
        'PENDING',
        NULL,
        NOW(),
        $10,
        $11
      )
      RETURNING *;
      `,
      [
        name,
        email || null,
        document || null,
        externalId || null,
        cnpj || null,
        companyName || null,
        tradeName || null,
        partnerName || null,
        JSON.stringify(cnpjData || {}),
        gatewayFeePercent ?? 0,
        partnerFeePercent ?? 100
      ]
    )

    return rows[0]
  }

  static async create({
    name,
    email,
    document,
    externalId,
    appId = null,
    clientSecret = null
  }) {
    const { rows } = await pool.query(
      `
      INSERT INTO users (
        name,
        email,
        document,
        external_id,
        doc_status,
        app_id,
        client_secret
      )
      VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
      RETURNING *;
      `,
      [
        name,
        email || null,
        document || null,
        externalId || null,
        appId || null,
        clientSecret || null
      ]
    )

    return rows[0]
  }

  static async createWithPassword({
    name,
    email,
    passwordHash,
    document = null,
    externalId = null,
    cnpj = null,
    companyName = null,
    tradeName = null,
    partnerName = null,
    appId = null,
    clientSecret = null
  }) {
    // Normalizar email para lowercase
    const normalizedEmail = email ? String(email).toLowerCase().trim() : null
    
    const { rows } = await pool.query(
      `
      INSERT INTO users (
        name,
        email,
        document,
        external_id,
        password_hash,
        cnpj,
        company_name,
        trade_name,
        partner_name,
        app_id,
        client_secret,
        doc_status,
        status
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10, $11,
        'PENDING',
        'ACTIVE'
      )
      RETURNING *;
      `,
      [
        name,
        normalizedEmail,
        document,
        externalId,
        passwordHash,
        cnpj,
        companyName,
        tradeName,
        partnerName,
        appId || null,
        clientSecret || null
      ]
    )

    return rows[0] || null
  }

  static async findAll() {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        document,
        external_id,
        cnpj,
        company_name,
        trade_name,
        partner_name,
        doc_status,
        gateway_fee_percent,
        partner_fee_percent,
        provider,
        webhook_url,
        webhook_url_pix_in,
        webhook_url_pix_out,
        ip_whitelist,
        created_at
      FROM users
      ORDER BY id DESC
      LIMIT 100;
      `
    )

    return rows
  }

  static async findById(id) {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        document,
        external_id,
        cnpj,
        company_name,
        trade_name,
        partner_name,
        cnpj_data,
        doc_status,
        doc_status_notes,
        doc_status_updated_at,
        gateway_fee_percent,
        partner_fee_percent,
        status,
        app_id,
        app_secret_hash,
        client_secret,
        provider,
        webhook_url,
        webhook_url_pix_in,
        webhook_url_pix_out,
        ip_whitelist,
        created_at
      FROM users
      WHERE id = $1
      LIMIT 1;
      `,
      [id]
    )

    return rows[0] || null
  }

  static async findByEmail(email) {
    // Normalizar email para lowercase antes de buscar
    const normalizedEmail = email ? String(email).toLowerCase().trim() : null
    if (!normalizedEmail) {
      return null
    }
    
    const { rows } = await pool.query(
      `
      SELECT *
      FROM users
      WHERE LOWER(TRIM(email)) = $1
      LIMIT 1;
      `,
      [normalizedEmail]
    )

    return rows[0] || null
  }

  static async findByAppId(appId) {
    if (!appId) return null
    
    const { rows } = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        document,
        external_id,
        cnpj,
        company_name,
        trade_name,
        partner_name,
        cnpj_data,
        doc_status,
        doc_status_notes,
        doc_status_updated_at,
        gateway_fee_percent,
        partner_fee_percent,
        status,
        app_id,
        app_secret_hash,
        client_secret,
        provider,
        webhook_url,
        webhook_url_pix_in,
        webhook_url_pix_out,
        ip_whitelist,
        created_at
      FROM users
      WHERE app_id = $1
      LIMIT 1;
      `,
      [appId]
    )

    return rows[0] || null
  }

  static async updateDocStatus(id, { status, notes }) {
    const { rows } = await pool.query(
      `
      UPDATE users
      SET
        doc_status = $2,
        doc_status_notes = $3,
        doc_status_updated_at = NOW()
      WHERE id = $1
      RETURNING *;
      `,
      [id, status, notes || null]
    )

    return rows[0] || null
  }

  static async updateSplit(id, { gatewayFeePercent, partnerFeePercent }) {
    const { rows } = await pool.query(
      `
      UPDATE users
      SET
        gateway_fee_percent = $2,
        partner_fee_percent = $3
      WHERE id = $1
      RETURNING *;
      `,
      [
        id,
        gatewayFeePercent,
        partnerFeePercent
      ]
    )

    return rows[0]
  }

  static async updateProvider(id, provider) {
    const { rows } = await pool.query(
      `
      UPDATE users
      SET
        provider = $2
      WHERE id = $1
      RETURNING *;
      `,
      [id, provider || null]
    )

    return rows[0] || null
  }

  static async updateConfig(id, { webhook_url, webhook_url_pix_in, webhook_url_pix_out, ip_whitelist }) {
    const { rows } = await pool.query(
      `
      UPDATE users
      SET
        webhook_url = $2,
        webhook_url_pix_in = $3,
        webhook_url_pix_out = $4,
        ip_whitelist = $5
      WHERE id = $1
      RETURNING *;
      `,
      [id, webhook_url || null, webhook_url_pix_in || null, webhook_url_pix_out || null, ip_whitelist || null]
    )

    return rows[0] || null
  }

  static async updatePassword({ userId, passwordHash }) {
    const { rows } = await pool.query(
      `
      UPDATE users
      SET
        password_hash = $2
      WHERE id = $1
      RETURNING *;
      `,
      [userId, passwordHash]
    )

    return rows[0] || null
  }

  static async updateCredentials({ id, appId, clientSecret }) {
    const { rows } = await pool.query(
      `
      UPDATE users
      SET
        app_id = $2,
        client_secret = $3
      WHERE id = $1
      RETURNING *;
      `,
      [id, appId || null, clientSecret || null]
    )

    return rows[0] || null
  }

  static generateRawCredentials() {
    const appIdRandom = crypto.randomBytes(8).toString('hex')
    const appId = `mg_live_${appIdRandom}`

    const secretRandom = crypto.randomBytes(16).toString('hex')
    const clientSecret = `sk_live_${secretRandom}`

    return { appId, clientSecret }
  }

  static async generateAndUpdateCredentials(userId) {
    const { appId, clientSecret } = this.generateRawCredentials()

    const user = await this.updateCredentials({
      id: userId,
      appId,
      clientSecret
    })

    return {
      user,
      appId,
      clientSecret
    }
  }

  static async findTreasuryUser() {
    try {
      const { rows } = await pool.query(
        `
        SELECT *
        FROM users
        WHERE is_treasury = TRUE
        ORDER BY id ASC
        LIMIT 1;
        `
      )

      return rows[0] || null
    } catch (err) {
      // Se o campo is_treasury não existir, retorna null
      // O código chamador usará HOUSE_USER_ID como fallback
      if (err.message && err.message.includes('column "is_treasury" does not exist')) {
        console.log('[findTreasuryUser] Campo is_treasury não existe na tabela users, usando fallback para HOUSE_USER_ID')
        return null
      }
      // Para outros erros, relança
      throw err
    }
  }
}
