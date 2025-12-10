import { pool } from '../config/db.js'

export class UserFeeModel {
  static async getByUserId(userId) {
    console.log('[UserFeeModel.getByUserId] Buscando taxas para userId:', userId, 'Tipo:', typeof userId)
    
    // Garantir que userId é um número
    const numericUserId = Number(userId)
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      console.error('[UserFeeModel.getByUserId] ❌ UserId inválido:', userId)
      return null
    }
    
    try {
      const { rows } = await pool.query(
        `
        SELECT
          user_id,
          pix_in_percent,
          pix_out_percent,
          pix_in_fee_type,
          pix_in_fee_value,
          pix_out_fee_type,
          pix_out_fee_value,
          created_at,
          updated_at
        FROM user_fees
        WHERE user_id = $1
        LIMIT 1;
        `,
        [numericUserId]
      )

      console.log('[UserFeeModel.getByUserId] Query executada. Linhas encontradas:', rows.length)
      if (rows.length > 0) {
        const row = rows[0]
        console.log('[UserFeeModel.getByUserId] Dados encontrados (raw):', row)
        
        // Garantir que os valores são números e tipos são strings válidos
        const result = {
          ...row,
          pix_in_percent: Number(row.pix_in_percent) || 0,
          pix_out_percent: Number(row.pix_out_percent) || 0,
          pix_in_fee_type: row.pix_in_fee_type || 'PERCENT',
          pix_in_fee_value: Number(row.pix_in_fee_value) || 0,
          pix_out_fee_type: row.pix_out_fee_type || 'PERCENT',
          pix_out_fee_value: Number(row.pix_out_fee_value) || 0
        }
        console.log('[UserFeeModel.getByUserId] Dados processados:', result)
        return result
      }

      console.log('[UserFeeModel.getByUserId] ⚠️ Nenhuma linha encontrada para userId:', numericUserId)
      return null
    } catch (error) {
      console.error('[UserFeeModel.getByUserId] ❌ Erro na query:', error)
      console.error('[UserFeeModel.getByUserId] Stack:', error.stack)
      throw error
    }
  }

  
  static async upsertForUser(userId, { 
    pixInPercent, 
    pixOutPercent,
    pixInFeeType = 'PERCENT',
    pixInFeeValue = 0,
    pixOutFeeType = 'PERCENT',
    pixOutFeeValue = 0
  }) {
    console.log('[UserFeeModel.upsertForUser] Salvando taxas:', {
      userId,
      pixInPercent,
      pixOutPercent,
      pixInFeeType,
      pixInFeeValue,
      pixOutFeeType,
      pixOutFeeValue
    })
    
    try {
      const { rows } = await pool.query(
        `
        INSERT INTO user_fees (
          user_id,
          pix_in_percent,
          pix_out_percent,
          pix_in_fee_type,
          pix_in_fee_value,
          pix_out_fee_type,
          pix_out_fee_value
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id)
        DO UPDATE SET
          pix_in_percent = EXCLUDED.pix_in_percent,
          pix_out_percent = EXCLUDED.pix_out_percent,
          pix_in_fee_type = EXCLUDED.pix_in_fee_type,
          pix_in_fee_value = EXCLUDED.pix_in_fee_value,
          pix_out_fee_type = EXCLUDED.pix_out_fee_type,
          pix_out_fee_value = EXCLUDED.pix_out_fee_value,
          updated_at = NOW()
        RETURNING
          user_id,
          pix_in_percent,
          pix_out_percent,
          pix_in_fee_type,
          pix_in_fee_value,
          pix_out_fee_type,
          pix_out_fee_value,
          created_at,
          updated_at;
        `,
        [
          userId, 
          pixInPercent, 
          pixOutPercent,
          pixInFeeType || 'PERCENT',
          Number(pixInFeeValue) || 0,
          pixOutFeeType || 'PERCENT',
          Number(pixOutFeeValue) || 0
        ]
      )

      console.log('[UserFeeModel.upsertForUser] Taxas salvas:', rows[0])
      return rows[0] || null
    } catch (error) {
      console.error('[UserFeeModel.upsertForUser] ❌ Erro ao salvar taxas:', error)
      throw error
    }
  }

  /**
   * Calcula a taxa a ser descontada baseado no tipo (PERCENT ou FIXED)
   * @param {number} amount - Valor da transação
   * @param {string} feeType - 'PERCENT' ou 'FIXED'
   * @param {number} feeValue - Valor da taxa (percentual ou fixo)
   * @returns {number} - Valor da taxa calculada
   */
  static calculateFee(amount, feeType, feeValue) {
    console.log('[UserFeeModel.calculateFee] Calculando taxa:', {
      amount,
      feeType,
      feeValue,
      amountType: typeof amount,
      feeValueType: typeof feeValue
    })
    
    if (!amount || amount <= 0) {
      console.log('[UserFeeModel.calculateFee] Valor inválido ou zero, retornando 0')
      return 0
    }
    
    if (!feeValue || feeValue <= 0) {
      console.log('[UserFeeModel.calculateFee] Taxa inválida ou zero, retornando 0')
      return 0
    }

    let calculatedFee = 0
    if (feeType === 'FIXED') {
      calculatedFee = Number(feeValue)
      console.log('[UserFeeModel.calculateFee] Taxa FIXA:', calculatedFee)
    } else {
      // PERCENT
      calculatedFee = (Number(amount) * Number(feeValue)) / 100
      console.log('[UserFeeModel.calculateFee] Taxa PERCENTUAL:', {
        amount: Number(amount),
        percent: Number(feeValue),
        calculated: calculatedFee
      })
    }
    
    const roundedFee = Number(calculatedFee.toFixed(2))
    console.log('[UserFeeModel.calculateFee] Taxa final calculada:', roundedFee)
    return roundedFee
  }

  /**
   * Calcula taxa PIX IN considerando fixa + percentual
   * @param {number} amount - Valor da transação
   * @param {object} fees - Objeto com as taxas do usuário
   * @returns {number} - Valor total da taxa (fixa + percentual)
   */
  static calculatePixInFee(amount, fees) {
    if (!amount || amount <= 0) return 0
    if (!fees) return 0

    let totalFee = 0

    // Taxa fixa
    if (fees.pix_in_fee_type === 'FIXED' && fees.pix_in_fee_value > 0) {
      totalFee += Number(fees.pix_in_fee_value)
    }

    // Taxa percentual
    if (fees.pix_in_percent > 0) {
      totalFee += (Number(amount) * Number(fees.pix_in_percent)) / 100
    }

    return Number(totalFee.toFixed(2))
  }

  /**
   * Calcula taxa PIX OUT considerando fixa + percentual
   * @param {number} amount - Valor da transação
   * @param {object} fees - Objeto com as taxas do usuário
   * @returns {number} - Valor total da taxa (fixa + percentual)
   */
  static calculatePixOutFee(amount, fees) {
    if (!amount || amount <= 0) return 0
    if (!fees) return 0

    let totalFee = 0

    // Taxa fixa
    if (fees.pix_out_fee_type === 'FIXED' && fees.pix_out_fee_value > 0) {
      totalFee += Number(fees.pix_out_fee_value)
    }

    // Taxa percentual
    if (fees.pix_out_percent > 0) {
      totalFee += (Number(amount) * Number(fees.pix_out_percent)) / 100
    }

    return Number(totalFee.toFixed(2))
  }
}


