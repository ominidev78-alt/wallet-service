import Joi from 'joi'
import crypto from 'crypto'
import { UserModel } from '../models/UserModel.js'
import { WalletModel } from '../models/WalletModel.js'
import { LedgerModel } from '../models/LedgerModel.js'
import { UserFeeModel } from '../models/UserFeeModel.js'
import { HttpError } from '../core/HttpError.js'
import { env } from '../config/env.js'

const paymentSchema = Joi.object({
  userId: Joi.alternatives()
    .try(
      Joi.number().integer().positive(),
      Joi.string().pattern(/^\d+$/).min(1)
    )
    .required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().default('BRL'),
  merOrderNo: Joi.string().allow('', null),
  providerOrderNo: Joi.string().allow('', null),
  provider: Joi.string().allow('', null),
  houseAmount: Joi.number().min(0).default(0),
  external_id: Joi.string().required()
})

class InternalPaymentsController {
  async creditHouseWallet({ currency, houseAmount, userId, type, provider, merOrderNo, providerOrderNo, externalId }) {
    console.log('[InternalPaymentsController.creditHouseWallet] === INÍCIO ===', {
      currency,
      houseAmount,
      userId,
      type,
      timestamp: new Date().toISOString()
    })

    // Prioridade 1: Buscar usuário com is_treasury = TRUE
    let houseUserId = null
    try {
      const treasuryUser = await UserModel.findTreasuryUser()
      if (treasuryUser && treasuryUser.id) {
        houseUserId = Number(treasuryUser.id)
        console.log('[InternalPaymentsController.creditHouseWallet] ✅ Usuário de tesouraria encontrado via findTreasuryUser:', {
          userId: houseUserId,
          name: treasuryUser.name
        })
      }
    } catch (err) {
      // Se o campo is_treasury não existir, continua para usar HOUSE_USER_ID
      console.log('[InternalPaymentsController.creditHouseWallet] ⚠️ Erro ao buscar via findTreasuryUser:', err.message)
    }

    // Prioridade 2: Usar HOUSE_USER_ID do .env
    if (!houseUserId || !Number.isFinite(houseUserId) || houseUserId <= 0) {
      const houseUserIdRaw = env.HOUSE_USER_ID
      console.log('[InternalPaymentsController.creditHouseWallet] Tentando usar env.HOUSE_USER_ID:', {
        raw: houseUserIdRaw,
        type: typeof houseUserIdRaw
      })
      
      if (houseUserIdRaw) {
        const parsed = parseInt(String(houseUserIdRaw).trim(), 10)
        if (Number.isFinite(parsed) && parsed > 0) {
          houseUserId = parsed
          console.log('[InternalPaymentsController.creditHouseWallet] ✅ Usuário de tesouraria obtido via env.HOUSE_USER_ID:', houseUserId)
        } else {
          console.error('[InternalPaymentsController.creditHouseWallet] ⚠️ env.HOUSE_USER_ID inválido após parse:', {
            raw: houseUserIdRaw,
            parsed
          })
        }
      } else {
        console.log('[InternalPaymentsController.creditHouseWallet] ⚠️ env.HOUSE_USER_ID não configurado')
      }
    }

    if (!houseUserId || !Number.isFinite(houseUserId) || houseUserId <= 0) {
      console.error('[InternalPaymentsController.creditHouseWallet] ❌ Nenhum usuário de tesouraria configurado', {
        houseUserId,
        isFinite: Number.isFinite(houseUserId),
        isPositive: houseUserId > 0,
        envHouseUserId: env.HOUSE_USER_ID
      })
      return
    }

    if (!houseAmount || houseAmount <= 0) {
      console.log('[InternalPaymentsController.creditHouseWallet] ⚠️ houseAmount inválido ou zero:', houseAmount)
      return
    }

    // Verificar se o usuário existe
    const houseUser = await UserModel.findById(houseUserId)
    if (!houseUser) {
      console.error('[InternalPaymentsController.creditHouseWallet] ❌ Usuário de tesouraria não encontrado no banco:', houseUserId)
      return
    }

    console.log('[InternalPaymentsController.creditHouseWallet] Usuário de tesouraria encontrado:', {
      userId: houseUserId,
      name: houseUser.name,
      email: houseUser.email
    })

    // Usar getOrCreateHouseWallet para garantir que a wallet seja do tipo HOUSE
    console.log('[InternalPaymentsController.creditHouseWallet] Obtendo ou criando wallet da tesouraria...', {
      houseUserId,
      currency
    })
    
    const houseWallet = await WalletModel.getOrCreateHouseWallet(houseUserId, currency)

    // Verificar se a wallet tem type = 'HOUSE'
    if (houseWallet && houseWallet.type !== 'HOUSE') {
      console.error('[InternalPaymentsController.creditHouseWallet] ❌ Wallet encontrada não é do tipo HOUSE!', {
        walletId: houseWallet.id,
        walletType: houseWallet.type,
        expectedType: 'HOUSE'
      })
      return
    }

    if (!houseWallet) {
      console.error('[InternalPaymentsController.creditHouseWallet] ❌ Wallet da tesouraria não encontrada!')
      return
    }

    console.log('[InternalPaymentsController.creditHouseWallet] Creditando taxa na tesouraria:', {
      walletId: houseWallet.id,
      amount: houseAmount,
      currency,
      userId,
      type
    })

    // Para taxas da tesouraria, usar o external_id principal com sufixo ou gerar baseado no merOrderNo
    const houseExternalId = externalId 
      ? `${externalId}-fee-${type.toLowerCase()}`
      : (merOrderNo 
        ? `${merOrderNo}-fee-${type.toLowerCase()}`
        : `house-fee-${crypto.randomUUID()}`)
    
    await WalletModel.credit(houseWallet.id, {
      amount: houseAmount,
      description:
        type === 'DEPOSIT'
          ? `Taxa de transação - PIX IN - Usuário ${userId}`
          : `Taxa de transação - PIX OUT - Usuário ${userId}`,
      meta: {
        transactionType: type === 'DEPOSIT' ? 'PIX_IN_FEE' : 'PIX_OUT_FEE',
        feeType: 'TRANSACTION_FEE',
        userId,
        merOrderNo: merOrderNo || null,
        providerOrderNo: providerOrderNo || null,
        provider: provider || null
      },
      externalId: houseExternalId
    })

    console.log('[InternalPaymentsController.creditHouseWallet] ✅ Taxa creditada na tesouraria com sucesso:', {
      walletId: houseWallet.id,
      amount: houseAmount,
      userId,
      type
    })
  }

  async applySplit(req, res, next) {
    try {
      console.log('[InternalPaymentsController.applySplit] ========================================');
      console.log('[InternalPaymentsController.applySplit] 🚀 INICIANDO PROCESSAMENTO DE CRÉDITO');
      console.log('[InternalPaymentsController.applySplit] ========================================');
      console.log('[InternalPaymentsController.applySplit] Payload recebido:', req.body);
      
      // Gerar external_id se não foi fornecido (compatibilidade com gateway)
      if (!req.body.external_id && !req.body.externalId) {
        const merOrderNo = req.body.merOrderNo || `user-${req.body.userId || 'unknown'}-${Date.now()}`
        req.body.external_id = `mutual_${merOrderNo}-${crypto.randomUUID()}`
        console.log('[InternalPaymentsController.applySplit] ⚠️ external_id não fornecido, gerando automaticamente:', req.body.external_id)
      } else if (req.body.externalId && !req.body.external_id) {
        // Se foi enviado como externalId (camelCase), converter para external_id (snake_case)
        req.body.external_id = req.body.externalId
      }
      
      const { value, error } = paymentSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        console.error('[InternalPaymentsController.applySplit] ❌ Erro de validação:', error.details);
        throw new HttpError(400, 'ValidationError', {
          details: error.details.map(d => d.message)
        })
      }

      const rawUserId = value.userId
      const userId =
        typeof rawUserId === 'string' ? parseInt(rawUserId, 10) : rawUserId

      if (!Number.isFinite(userId) || userId <= 0) {
        throw new HttpError(400, 'InvalidUserId')
      }

      const originalAmount = Number(value.amount) // Valor recebido (pode ser líquido ou bruto)
      const currency = (value.currency || 'BRL').toUpperCase()
      let houseAmount = Number(value.houseAmount || 0)
      let netAmount = originalAmount

      // Se houseAmount não foi fornecido ou é 0, calcular a taxa automaticamente
      if (!houseAmount || houseAmount <= 0) {
        console.log('[InternalPaymentsController.applySplit] houseAmount não fornecido, calculando taxa automaticamente...', {
          userId,
          originalAmount
        })
        
        try {
          const fees = await UserFeeModel.getByUserId(userId)
          if (fees) {
            // Calcular taxa fixa + percentual
            houseAmount = UserFeeModel.calculatePixInFee(originalAmount, fees)
            
            console.log('[InternalPaymentsController.applySplit] Taxa calculada:', {
              originalAmount,
              houseAmount,
              fees: {
                pix_in_fee_type: fees.pix_in_fee_type,
                pix_in_fee_value: fees.pix_in_fee_value,
                pix_in_percent: fees.pix_in_percent
              }
            })
          } else {
            console.log('[InternalPaymentsController.applySplit] ⚠️ Nenhuma taxa configurada para o usuário')
          }
        } catch (feeError) {
          console.error('[InternalPaymentsController.applySplit] Erro ao calcular taxa:', feeError.message)
          // Continuar sem taxa se houver erro
        }
      } else {
        // Se houseAmount já foi fornecido, significa que o gateway já descontou a taxa
        // Neste caso, o originalAmount já é o valor líquido
        console.log('[InternalPaymentsController.applySplit] houseAmount já fornecido pelo gateway, amount já é líquido:', {
          originalAmount,
          houseAmount,
          note: 'O valor originalAmount já tem a taxa descontada'
        })
      }

      // Para depósito: se houseAmount foi fornecido, amount já é líquido
      // Se não foi fornecido, calcular líquido = total - taxa
      if (houseAmount > 0 && value.houseAmount) {
        // houseAmount foi fornecido explicitamente, então amount já é líquido
        netAmount = originalAmount
        console.log('[InternalPaymentsController.applySplit] houseAmount fornecido - amount já é líquido, não descontar novamente')
      } else if (houseAmount > 0) {
        // houseAmount foi calculado, então precisamos descontar
        netAmount = originalAmount - houseAmount
        console.log('[InternalPaymentsController.applySplit] houseAmount calculado - descontando do amount')
      } else {
        // Sem taxa, valor líquido = valor total
        netAmount = originalAmount
        console.log('[InternalPaymentsController.applySplit] Sem taxa - valor líquido = valor total')
      }

      const user = await UserModel.findById(userId)
      if (!user) {
        return res.status(404).json({
          ok: false,
          error: 'NotFound'
        })
      }

      let wallet = await WalletModel.getUserWallet(userId, currency)
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, currency)

      const current = Number(wallet.balance) || 0
      const newBalance = current + netAmount // Creditar valor líquido (total - taxa)

      console.log('[InternalPaymentsController.applySplit] 💰 Aplicando crédito na carteira:', {
        userId,
        currentBalance: current,
        originalAmount,
        feeAmount: houseAmount,
        netAmount,
        newBalance
      });

      await WalletModel.updateBalance(wallet.id, newBalance)

      console.log('[InternalPaymentsController.applySplit] ✅ Saldo atualizado com sucesso');

      // Criar entrada de crédito no ledger
      // IMPORTANTE: A descrição deve conter "DEPÓSITO PIX" para o frontend detectar corretamente
      await LedgerModel.addEntry({
        walletId: wallet.id,
        direction: 'CREDIT',
        amount: netAmount, // Creditar valor líquido
        description: `Depósito PIX ${value.provider || 'GATEWAY'} - merOrderNo=${
          value.merOrderNo || ''
        }`,
        meta: {
          provider: value.provider || null,
          merOrderNo: value.merOrderNo || null,
          providerOrderNo: value.providerOrderNo || null,
          source: value.provider === 'PAYZU' ? 'WEBHOOK_PAYZU_DEPOSIT' : 'WEBHOOK_STARPAGO_DEPOSIT',
          previousBalance: current,
          newBalance,
          originalAmount, // Valor total depositado
          feeAmount: houseAmount, // Taxa
          netAmount, // Valor líquido creditado
          totalAmount: originalAmount, // Valor total depositado (para compatibilidade)
          orderNo: value.providerOrderNo || value.merOrderNo || null,
          merOrderNo: value.merOrderNo || null,
          providerOrderNo: value.providerOrderNo || null
        },
        externalId: value.external_id
      })
      
      console.log('[InternalPaymentsController.applySplit] ✅ Entrada de crédito criada no ledger:', {
        direction: 'CREDIT',
        amount: netAmount,
        description: `Depósito PIX ${value.provider || 'GATEWAY'}`,
        originalAmount,
        feeAmount: houseAmount,
        netAmount
      });

      // Creditar taxa na tesouraria se houver
      if (houseAmount > 0) {
        await this.creditHouseWallet({
          currency,
          houseAmount,
          userId,
          type: 'DEPOSIT',
          provider: value.provider || null,
          merOrderNo: value.merOrderNo || null,
          providerOrderNo: value.providerOrderNo || null,
          externalId: value.external_id
        })
      } else {
        console.log('[InternalPaymentsController.applySplit] ⚠️ Nenhuma taxa a ser creditada (houseAmount = 0)')
      }

      console.log('[InternalPaymentsController.applySplit] ✅✅✅ CRÉDITO PROCESSADO COM SUCESSO ✅✅✅');
      console.log('[InternalPaymentsController.applySplit] Resumo:', {
        userId,
        walletId: wallet.id,
        originalAmount, // Valor total depositado
        netAmount, // Valor líquido creditado
        houseAmount, // Taxa
        currency,
        balance: newBalance,
        previousBalance: current
      });
      console.log('[InternalPaymentsController.applySplit] ========================================');

      return res.json({
        ok: true,
        userId,
        walletId: wallet.id,
        originalAmount, // Valor total depositado
        netAmount, // Valor líquido creditado
        houseAmount, // Taxa
        currency,
        balance: newBalance
      })
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status || 400).json({
          ok: false,
          error: err.code || 'Error',
          message: err.message
        })
      }

      return res.status(500).json({
        ok: false,
        error: 'InternalError'
      })
    }
  }

  async applyWithdraw(req, res, next) {
    try {
      console.log('[InternalPaymentsController.applyWithdraw] ========================================');
      console.log('[InternalPaymentsController.applyWithdraw] 🚀 INICIANDO PROCESSAMENTO DE DÉBITO');
      console.log('[InternalPaymentsController.applyWithdraw] ========================================');
      console.log('[InternalPaymentsController.applyWithdraw] Payload recebido:', req.body);
      
      if (!req.body.external_id && !req.body.externalId) {
        const merOrderNo = req.body.merOrderNo || `withdraw-${req.body.userId || 'unknown'}-${Date.now()}`
        req.body.external_id = `mutual_${merOrderNo}-${crypto.randomUUID()}`
        console.log('[InternalPaymentsController.applyWithdraw] ⚠️ external_id não fornecido, gerando automaticamente:', req.body.external_id)
      } else if (req.body.externalId && !req.body.external_id) {
        req.body.external_id = req.body.externalId
      }
      
      const { value, error } = paymentSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        console.error('[InternalPaymentsController.applyWithdraw] ❌ Erro de validação:', error.details);
        throw new HttpError(400, 'ValidationError', {
          details: error.details.map(d => d.message)
        })
      }

      const rawUserId = value.userId
      const userId =
        typeof rawUserId === 'string' ? parseInt(rawUserId, 10) : rawUserId

      if (!Number.isFinite(userId) || userId <= 0) {
        throw new HttpError(400, 'InvalidUserId')
      }

      const amount = Number(value.amount) // Valor líquido a ser enviado
      const currency = (value.currency || 'BRL').toUpperCase()
      let houseAmount = Number(value.houseAmount || 0)

      // Se houseAmount não foi fornecido ou é 0, calcular a taxa automaticamente
      if (!houseAmount || houseAmount <= 0) {
        console.log('[InternalPaymentsController.applyWithdraw] houseAmount não fornecido, calculando taxa automaticamente...', {
          userId,
          amount
        })
        
        try {
          const fees = await UserFeeModel.getByUserId(userId)
          if (fees) {
            // Calcular taxa fixa + percentual
            houseAmount = UserFeeModel.calculatePixOutFee(amount, fees)
            
            console.log('[InternalPaymentsController.applyWithdraw] Taxa calculada:', {
              originalAmount: amount,
              houseAmount,
              fees: {
                pix_out_fee_type: fees.pix_out_fee_type,
                pix_out_fee_value: fees.pix_out_fee_value,
                pix_out_percent: fees.pix_out_percent
              }
            })
          } else {
            console.log('[InternalPaymentsController.applyWithdraw] ⚠️ Nenhuma taxa configurada para o usuário')
          }
        } catch (feeError) {
          console.error('[InternalPaymentsController.applyWithdraw] Erro ao calcular taxa:', feeError.message)
          // Continuar sem taxa se houver erro
        }
      }

      const user = await UserModel.findById(userId)
      if (!user) {
        return res.status(404).json({
          ok: false,
          error: 'NotFound'
        })
      }

      let wallet = await WalletModel.getUserWallet(userId, currency)
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, currency)

      const current = Number(wallet.balance) || 0
      // Para saque: valor total debitado = valor líquido + taxa
      const totalAmount = amount + houseAmount
      const newBalance = current - totalAmount

      if (newBalance < 0) {
        throw new HttpError(400, 'InsufficientBalance', {
          message: 'Saldo insuficiente',
          currentBalance: current,
          requiredAmount: totalAmount,
          withdrawAmount: amount,
          feeAmount: houseAmount
        })
      }

      console.log('[InternalPaymentsController.applyWithdraw] 💰 Aplicando débito na carteira:', {
        userId,
        currentBalance: current,
        withdrawAmount: amount,
        feeAmount: houseAmount,
        totalToDebit: totalAmount,
        newBalance
      });

      await WalletModel.updateBalance(wallet.id, newBalance)

      console.log('[InternalPaymentsController.applyWithdraw] ✅ Saldo atualizado com sucesso');

      // Criar duas entradas DEBIT separadas:
      // 1. Débito do valor líquido (sem taxa)
      // 2. Débito da taxa (se houver)
      
      // Entrada 1: Valor líquido do saque
      await LedgerModel.addEntry({
        walletId: wallet.id,
        direction: 'DEBIT',
        amount: amount, // Valor líquido (sem taxa)
        description: `Saque ${value.provider || 'GATEWAY'} - merOrderNo=${
          value.merOrderNo || ''
        }`,
        meta: {
          provider: value.provider || null,
          merOrderNo: value.merOrderNo || null,
          providerOrderNo: value.providerOrderNo || null,
          source: 'WEBHOOK_STARPAGO_WITHDRAW',
          previousBalance: current,
          newBalance,
          originalAmount: amount, // Valor líquido
          feeAmount: houseAmount, // Taxa
          totalAmount, // Valor total debitado
          netAmount: amount // Valor líquido sacado
        },
        externalId: value.external_id
      })

      // Entrada 2: Taxa do saque (se houver)
      if (houseAmount > 0) {
        await LedgerModel.addEntry({
          walletId: wallet.id,
          direction: 'DEBIT',
          amount: houseAmount, // Taxa debitada
          description: `Taxa de transação - PIX OUT - merOrderNo=${
            value.merOrderNo || ''
          }`,
          meta: {
            provider: value.provider || null,
            merOrderNo: value.merOrderNo || null,
            providerOrderNo: value.providerOrderNo || null,
            source: 'WEBHOOK_STARPAGO_WITHDRAW',
            transactionType: 'PIX_OUT_FEE',
            feeType: 'TRANSACTION_FEE',
            originalAmount: amount, // Valor líquido do saque
            feeAmount: houseAmount, // Taxa debitada
            totalAmount, // Valor total debitado
            relatedTransaction: 'PIX_WITHDRAW'
          },
          externalId: `${value.external_id}-fee`
        })

        // Creditar taxa na tesouraria
        await this.creditHouseWallet({
          currency,
          houseAmount,
          userId,
          type: 'WITHDRAW',
          provider: value.provider || null,
          merOrderNo: value.merOrderNo || null,
          providerOrderNo: value.providerOrderNo || null,
          externalId: value.external_id
        })
      } else {
        console.log('[InternalPaymentsController.applyWithdraw] ⚠️ Nenhuma taxa a ser debitada (houseAmount = 0)')
      }

      console.log('[InternalPaymentsController.applyWithdraw] ✅✅✅ DÉBITO PROCESSADO COM SUCESSO ✅✅✅');
      console.log('[InternalPaymentsController.applyWithdraw] Resumo:', {
        userId,
        walletId: wallet.id,
        amount, // Valor líquido
        houseAmount, // Taxa
        totalAmount, // Valor total debitado
        currency,
        balance: newBalance,
        previousBalance: current
      });
      console.log('[InternalPaymentsController.applyWithdraw] ========================================');

      return res.json({
        ok: true,
        userId,
        walletId: wallet.id,
        amount, // Valor líquido
        houseAmount, // Taxa
        totalAmount, // Valor total debitado
        currency,
        balance: newBalance
      })
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status || 400).json({
          ok: false,
          error: err.code || 'Error',
          message: err.message
        })
      }

      return res.status(500).json({
        ok: false,
        error: 'InternalError'
      })
    }
  }
}

export const internalPaymentsController = new InternalPaymentsController()
