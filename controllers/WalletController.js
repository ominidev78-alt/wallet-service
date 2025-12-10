import Joi from 'joi'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import { WalletModel } from '../models/WalletModel.js'
import { LedgerModel } from '../models/LedgerModel.js'
import { GatewayTransactionModel } from '../models/GatewayTransactionModel.js'
import { WebhookLogModel } from '../models/WebhookLogModel.js'
import { HttpError } from '../core/HttpError.js'
import { env } from '../config/env.js'

const mutateSchema = Joi.object({
  amount: Joi.number().positive().required(),
  description: Joi.string().allow('', null),
  meta: Joi.object().unknown(true).default({}),
  external_id: Joi.string().required()
})

const GATEWAY_BASE_URL = env.GATEWAY_BASE_URL || 'https://payg2a.online'

const GATEWAY_OPERATOR_ID = Number(env.GATEWAY_OPERATOR_ID || 1)
const JWT_OPERATOR_SECRET = env.JWT_OPERATOR_SECRET || 'mutual-secret-2025'

export class WalletController {
  async getBalance(req, res, next) {
    try {
      const userId = Number(req.params.id)
      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, 'UserNotFound')

      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      return res.json({
        ok: true,
        walletId: wallet.id,
        balance: wallet.balance
      })
    } catch (err) {
      next(err)
    }
  }

  async ledger(req, res, next) {
    try {
      const rawUserId =
        req.user?.id ||
        req.user?.userId ||
        req.user?.user_id ||
        req.params.id ||
        req.params.userId ||
        req.params.user_id ||
        req.body.userId ||
        req.body.user_id ||
        req.query.userId ||
        req.query.user_id

      if (!rawUserId) throw new HttpError(400, 'MissingUserId')

      const userId =
        typeof rawUserId === 'string' ? parseInt(rawUserId, 10) : rawUserId

      if (!Number.isFinite(userId) || userId <= 0)
        throw new HttpError(400, 'InvalidUserId')

      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, 'UserNotFound')

      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      const entries = await LedgerModel.getWalletEntries(wallet.id)

      const enriched = await Promise.all(entries.map(async (e) => {
        const out = { ...e }
        let meta = out.meta || {}


        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta)
          } catch {
   
            try {
              meta = JSON.parse(meta.replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
            } catch {
              meta = { raw: meta }
            }
          }
        }

        let tradeNo = meta.tradeNo || meta.trade_no || null
        let document = meta.document || meta.payer_document || meta.payerCPF || null
        let name = meta.payer_name || meta.name || null

 
        const newMeta = { ...meta }

        if (!tradeNo || !document) {
          let tx = null
          if (meta.merOrderNo) {
            tx = await GatewayTransactionModel.findByMerOrderNo(meta.merOrderNo)
          }
          if (!tx && tradeNo) {
            tx = await GatewayTransactionModel.findByTradeNo(tradeNo)
          }

          if (tx) {
            const raw = tx.raw_response

        
            if (raw) {
              try {
                const parsedRaw = typeof raw === 'string' ? JSON.parse(raw) : raw
                newMeta.raw_response = parsedRaw
              } catch {
                newMeta.raw_response = raw
              }
            }

            if (!tradeNo) {
              try {
                const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
                tradeNo =
                  obj?.tradeNo ||
                  obj?.trade_no ||
                  obj?.txid ||
                  obj?.endToEndId ||
                  obj?.end_to_end_id ||
                  null
              } catch {
                tradeNo = tradeNo || null
              }
            }

            if (!document) {
              let extracted = GatewayTransactionModel.extractDocumentFromRaw(raw)
              if (!extracted && raw && typeof raw === 'object') {
                extracted =
                  raw?.payer?.document_number ||
                  raw?.payer?.document ||
                  raw?.document_number ||
                  raw?.document ||
                  raw?.extra?.document ||
                  raw?.accountHolder?.document ||
                  null
              }
              if (extracted) {
                document = String(extracted).replace(/\D/g, '')
              } else if (tx?.document) {
                document = tx.document
              }
            }
            if (!name) {
              name = GatewayTransactionModel.extractNameFromRaw(raw) ||
                (raw && typeof raw === 'object' ? (raw?.payer?.name || raw?.accountHolder?.name || raw?.holder?.name || null) : null)
            }
          }
        }

        if (tradeNo) {
          newMeta.tradeNo = tradeNo
          newMeta.e2e = tradeNo
        }

        if (document) newMeta.document = document
        if (name) newMeta.payer_name = name

        out.tradeNo = tradeNo
        out.document = document
        out.name = name || null
        out.meta = newMeta
        if (meta.feeType === 'TRANSACTION_FEE' || /Taxa de transação/i.test(out.description || '')) {
          out.description = 'Taxa de transação'
        } else if (tradeNo && typeof out.description === 'string') {
          if (/Depósito STARPAGO/i.test(out.description))
            out.description = `Depósito STARPAGO - tradeNo=${tradeNo}`
          if (/Saque STARPAGO/i.test(out.description))
            out.description = `Saque STARPAGO - tradeNo=${tradeNo}`
          if (/PIX DEPOSIT/i.test(out.description))
            out.description = `PIX DEPOSIT ${tradeNo}`
          if (/PIX WITHDRAW/i.test(out.description))
            out.description = `PIX WITHDRAW ${tradeNo}`
        }

        return out
      }))

      return res.json({
        ok: true,
        walletId: wallet.id,
        balance: wallet.balance,
        ledger: enriched
      })
    } catch (err) {
      next(err)
    }
  }

  async mutate(req, res, next) {
    try {
      const { value, error } = mutateSchema.validate(req.body, { abortEarly: false })
      if (error) throw new HttpError(400, 'ValidationError', { details: error.details })

      const userId = Number(req.params.id)
      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, 'UserNotFound')

      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      const newBalance = await WalletModel.mutateBalance(wallet.id, {
        amount: value.amount,
        description: value.description || 'Manual mutation',
        meta: value.meta,
        externalId: value.external_id
      })

      return res.json({ ok: true, balance: newBalance })
    } catch (err) {
      next(err)
    }
  }

  async mutateCredit(req, res, next) {
    try {
      const { value, error } = mutateSchema.validate(req.body, { abortEarly: false })
      if (error) throw new HttpError(400, 'ValidationError', { details: error.details })

      const userId = Number(req.params.id)
      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, 'UserNotFound')

      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      const newBalance = await WalletModel.credit(wallet.id, {
        amount: value.amount,
        description: value.description || 'Manual credit',
        meta: value.meta
      })

      return res.json({ ok: true, balance: newBalance })
    } catch (err) {
      next(err)
    }
  }

  async mutateDebit(req, res, next) {
    try {
      const { value, error } = mutateSchema.validate(req.body, { abortEarly: false })
      if (error) throw new HttpError(400, 'ValidationError', { details: error.details })

      const userId = Number(req.params.id)
      const user = await UserModel.findById(userId)
      if (!user) throw new HttpError(404, 'UserNotFound')

      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      const newBalance = await WalletModel.debit(wallet.id, {
        direction: 'DEBIT',
        amount: value.amount,
        description: value.description || 'Manual debit',
        meta: value.meta,
        externalId: value.external_id
      })

      return res.json({ ok: true, balance: newBalance })
    } catch (err) {
      next(err)
    }
  }

  async pixDeposit(req, res, next) {
    try {
      const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
      const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

      if (!appId) {
        return res.status(400).json({
          ok: false,
          error: 'MissingAppId',
          message: 'O header app_id é obrigatório para autenticação.'
        })
      }

      if (!clientId) {
        return res.status(400).json({
          ok: false,
          error: 'MissingClientId',
          message: 'O header client_id é obrigatório para autenticação.'
        })
      }

      const { amount, userId, payerName, payerCPF } = req.body || {}

      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'InvalidAmount',
          message: 'O valor do depósito (amount) deve ser maior que zero.'
        })
      }

      if (!JWT_OPERATOR_SECRET) {
        return res.status(500).json({
          ok: false,
          error: 'MissingOperatorSecret',
          message:
            'JWT_OPERATOR_SECRET não configurado no ambiente deste serviço.'
        })
      }

      const rawUserId = userId ?? req.query.userId ?? req.query.user_id
      let user = null
      let finalUserId = null

      if (rawUserId) {
        const providedUserId = typeof rawUserId === 'string' ? parseInt(rawUserId, 10) : rawUserId
        if (!Number.isFinite(providedUserId) || providedUserId <= 0) {
          return res.status(400).json({
            ok: false,
            error: 'InvalidUserId',
            message: 'userId inválido.'
          })
        }

        user = await UserModel.findById(providedUserId)
        
        if (!user) {
          return res.status(404).json({
            ok: false,
            error: 'UserNotFound',
            message: 'Usuário não encontrado.'
          })
        }
        if (user.app_id && user.app_id !== appId) {
          console.log('[pixDeposit]  app_id enviado não corresponde ao usuário, mas userId foi fornecido (permitindo para compatibilidade):', {
            userId: providedUserId,
            appIdEnviado: appId,
            appIdUsuario: user.app_id
          })
        }

        if (user.client_secret) {
          if (clientId !== appId && clientId !== user.client_secret) {
            if (clientId !== appId) {
              console.log('[pixDeposit]  client_id não corresponde, mas userId foi fornecido (permitindo para compatibilidade)')
    
            }
          }
        }

        finalUserId = providedUserId
      } else {
        user = await UserModel.findByAppId(appId)
        
        if (!user) {
          return res.status(401).json({
            ok: false,
            error: 'InvalidAppId',
            message: 'app_id inválido ou não encontrado.'
          })
        }

        if (clientId !== appId && clientId !== user.client_secret) {
          return res.status(401).json({
            ok: false,
            error: 'InvalidClientId',
            message: 'client_id inválido ou não corresponde às credenciais.'
          })
        }

        finalUserId = user.id
      }

      const merOrderNo = `user-${finalUserId}-${Date.now()}`

      const operatorToken = jwt.sign(
        {
          type: 'OPERATOR',
          sub: GATEWAY_OPERATOR_ID
        },
        JWT_OPERATOR_SECRET,
        { expiresIn: '5m' }
      )

      const payload = {
        userId: finalUserId,
        amount: Number(amount),
        currency: 'BRL',
        payMethod: 'PIX',
        merOrderNo,
        providerCode: user.provider || "PAYZU",
        extra: {
          payerCPF: payerCPF || null,
          payerName: payerName || null
        }
      }

      console.log(
        '[PIX DEPOSIT USER-SERVICE] Enviando para GATEWAY_DEPOSIT_URL:',
        `${GATEWAY_BASE_URL}/api/deposit`,
        'payload:',
        JSON.stringify(payload)
      )

      const gatewayResponse = await axios.post(`${GATEWAY_BASE_URL}/api/deposit`, payload, {
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'Content-Type': 'application/json'
        }
      })

      const d = gatewayResponse.data || {}
      console.log('[PIX DEPOSIT USER-SERVICE] Resposta do gateway:', d)
      const clientIp =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        '2121.123123.1123'

      const paymentId = crypto.randomUUID()
      const companyId = crypto.randomUUID()
      const customerId = crypto.randomUUID()
      const recipientId = crypto.randomUUID()


      const now = new Date()
      const createdAt = now.toISOString().replace('Z', '-03:00')
      const expirationDate = new Date(now.getTime() + 20 * 60 * 1000)
      const expirationDateFormatted = expirationDate.toISOString().replace('Z', '-03:00')

      const qrCodeUrl =
        d.params?.qrcode ||
        d.params?.qrCode ||
        d.params?.emv ||
        d.params?.brCode ||
        d.qrCodeText ||
        d.raw.qrCodeText || 
        'https://digital.mundipagg.com/pix/'

      const finalAmount = d.amount !== undefined ? d.amount : Number(amount)
      const spreadPercentage = 3
      const fixedAmount = 3
      const estimatedFee = Math.round((finalAmount * spreadPercentage / 100) + fixedAmount)
      const netAmount = finalAmount - estimatedFee

      try {
        await WebhookLogModel.insert({
          event_type: 'PIX_CREATED',
          transaction_id: d.orderNo || merOrderNo || null,
          target_url: user.webhook_url || req.headers['x-webhook-url'] || null,
          status: 'pending',
          payload: {
            userId: finalUserId,
            amount: finalAmount,
            provider: user.provider || 'PAYZU',
            merOrderNo,
            gateway: d
          }
        })
      } catch (e) {
        console.log('[pixDeposit] webhook_logs insert failed:', e?.message)
      }

      return res.status(200).json({
        id: paymentId,
        amount: finalAmount,
        refundedAmount: 0,
        companyId: companyId,
        installments: 1,
        paymentMethod: 'PIX',
        status: 'waiting_payment',
        postbackUrl: null,
        metadata: '{}',
        traceable: false,
        createdAt: createdAt,
        updatedAt: createdAt,
        paidAt: null,
        ip: clientIp,
        externalRef: d.orderNo || d.externalRef || `ch_GnOkRWjS0cN06P29`,
        customer: {
          id: customerId,
          name: payerName || user?.name || 'teste',
          email: user?.email || 'teste@gmail.com',
          phone: '11991301322',
          birthdate: null,
          createdAt: now.toISOString().split('.')[0],
          document: {
            number: payerCPF || user?.document || '59801246081',
            type: 'CPF'
          },
          address: {
            street: 'Rua São Jorge',
            streetNumber: '165',
            complement: 'casa',
            zipCode: '65076632',
            neighborhood: 'Ilhinha',
            city: 'São Luís',
            state: 'MA',
            country: 'BR'
          }
        },
        card: null,
        boleto: null,
        pix: {
          qrcode: qrCodeUrl,
          expirationDate: expirationDateFormatted,
          end2EndId: null,
          receiptUrl: null
        },
        shipping: {
          street: 'Rua São Jorge',
          streetNumber: '165',
          complement: 'casa',
          zipCode: '65076632',
          neighborhood: 'Ilhinha',
          city: 'São Luís',
          state: 'MA',
          country: 'BR'
        },
        refusedReason: null,
        items: [
          {
            title: 'Teste 2',
            quantity: 1
          }
        ],
        splits: [
          {
            recipientId: recipientId,
            netAmount: netAmount
          }
        ],
        fee: {
          fixedAmount: fixedAmount,
          spreadPercentage: spreadPercentage,
          estimatedFee: estimatedFee,
          netAmount: netAmount
        }
      })
    } catch (err) {
      if (err.response) {
        console.error(
          '[PIX DEPOSIT USER-SERVICE][GATEWAY ERROR]',
          err.response.status,
          err.response.data
        )
      } else {
        console.error('[PIX DEPOSIT USER-SERVICE][ERROR]', err)
      }

      return res.status(500).json({
        ok: false,
        error: 'PixDepositCreateFailed',
        message: 'Falha ao criar cobrança Pix pelo user-service.'
      })
    }
  }

  async pixDepositCallback(req, res, next) {
    try {
      const { merOrderNo, orderNo, tradeNo, status, amount, userId } = req.body
      if (!merOrderNo || (!orderNo && !tradeNo))
        throw new HttpError(400, 'InvalidCallbackPayload')

      if (!userId) return res.json({ ok: true, ignored: true })

      const user = await UserModel.findById(userId)
      if (!user) return res.json({ ok: true, ignored: true })

      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      if (
        String(status).toUpperCase() === 'SUCCESS' ||
        String(status).toUpperCase() === 'PAID'
      ) {
        const creditedAmount = Number(amount) || 0

        if (creditedAmount > 0) {
          await WalletModel.credit(wallet.id, {
            amount: creditedAmount,
            description: tradeNo ? `PIX IN ${tradeNo}` : `PIX IN ${orderNo}`,
            meta: {
              merOrderNo,
              orderNo,
              tradeNo: tradeNo || undefined,
              document: req.body?.payer?.document_number || req.body?.document || null,
              raw_response: (() => { try { return JSON.stringify(req.body) } catch { return undefined } })(),
              provider: 'GATEWAY',
              type: 'PIX_DEPOSIT'
            }
          })

    
          try {
            await WebhookLogModel.insert({
              event_type: 'PIX_COMPLETED',
              transaction_id: tradeNo || orderNo || null,
              target_url: user.webhook_url || null,
              http_status: 200,
              latency_ms: null,
              status: 'delivered',
              payload: req.body || null
            })
          } catch (e) {
            console.log('[pixDepositCallback] webhook_logs insert failed:', e?.message)
          }
        }
      }

      return res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  }

  async pixWithdraw(req, res, next) {
    try {
 
      const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
      const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

      if (!appId) {
        return res.status(400).json({
          ok: false,
          error: 'MissingAppId',
          message: 'O header app_id é obrigatório para autenticação.'
        })
      }

      if (!clientId) {
        return res.status(400).json({
          ok: false,
          error: 'MissingClientId',
          message: 'O header client_id é obrigatório para autenticação.'
        })
      }

      const pixWithdrawSchema = Joi.object({
        amount: Joi.number().positive().required(),
        key: Joi.string().required(),
        keyType: Joi.string().valid('cpf', 'cnpj', 'email', 'mobile', 'evp').required(),
        userId: Joi.number().integer().positive().optional(),
        user_id: Joi.number().integer().positive().optional(),
        bankCode: Joi.string().optional(),
        extra: Joi.object().unknown(true).default({}),
        orderId: Joi.string().optional(),
        externalId: Joi.string()
      })

      const { value, error } = pixWithdrawSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      if (!value || !value.amount) {
        throw new HttpError(400, 'InvalidRequest', { message: 'Valor do saque é obrigatório' })
      }

      const rawUserId = value.userId || value.user_id || req.params.id
      let user = null
      let userId = null

      if (rawUserId) {
        const providedUserId = typeof rawUserId === 'string' ? parseInt(rawUserId, 10) : rawUserId
        if (!Number.isFinite(providedUserId) || providedUserId <= 0) {
          throw new HttpError(400, 'InvalidUserId', { message: 'userId inválido.' })
        }

        user = await UserModel.findById(providedUserId)
        
        if (!user) {
          throw new HttpError(404, 'UserNotFound', { message: 'Usuário não encontrado' })
        }
        if (user.app_id && user.app_id !== appId) {
          console.log('[pixWithdraw] app_id enviado não corresponde ao usuário, mas userId foi fornecido (permitindo para compatibilidade):', {
            userId: providedUserId,
            appIdEnviado: appId,
            appIdUsuario: user.app_id
          })
        }

      
        if (user.client_secret) {
          if (clientId !== appId && clientId !== user.client_secret) {
            if (clientId !== appId) {
              console.log('[pixWithdraw]  client_id não corresponde, mas userId foi fornecido (permitindo para compatibilidade)')
              
            }
          }
        }

        userId = providedUserId
      } else {
     
        user = await UserModel.findByAppId(appId)
        
        if (!user) {
          return res.status(401).json({
            ok: false,
            error: 'InvalidAppId',
            message: 'app_id inválido ou não encontrado.'
          })
        }

   
        if (clientId !== appId && clientId !== user.client_secret) {
          return res.status(401).json({
            ok: false,
            error: 'InvalidClientId',
            message: 'client_id inválido ou não corresponde às credenciais.'
          })
        }

        userId = user.id
      }

      const twofa = await TwoFactorAuthModel.findByUserId(Number(userId))
      const twofaEnabled = Boolean(twofa && twofa.enabled === true)

      if (!twofaEnabled) {
        return res.status(403).json({
          ok: false,
          error: 'TwoFactorRequired',
          message: 'Para realizar saques PIX, você precisa ativar o 2FA. Acesse a página de Segurança (2FA) para ativar.'
        })
      }

      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      const withdrawAmount = Number(value.amount)

      if (!withdrawAmount || withdrawAmount <= 0) {
        throw new HttpError(400, 'InvalidAmount', { message: 'Valor do saque deve ser maior que zero' })
      }

      console.log('[pixWithdraw] === INÍCIO ===', {
        userId,
        withdrawAmount,
        currentBalance: wallet.balance,
        timestamp: new Date().toISOString()
      })

      console.log('[pixWithdraw] Calculando taxa de PIX OUT...')
      const { totalAmount, feeAmount, netAmount } = await this.calculatePixOutFee(userId, withdrawAmount)

      console.log('[pixWithdraw] Taxa calculada:', {
        originalAmount: withdrawAmount,
        totalAmount,
        feeAmount,
        netAmount,
        currentBalance: wallet.balance
      })


      if (Number(wallet.balance) < totalAmount) {
        console.error('[pixWithdraw] ❌ Saldo insuficiente:', {
          currentBalance: wallet.balance,
          requiredAmount: totalAmount,
          withdrawAmount,
          feeAmount
        })
        throw new HttpError(400, 'InsufficientBalance', {
          message: 'Saldo insuficiente para realizar o saque',
          currentBalance: wallet.balance,
          requiredAmount: totalAmount,
          withdrawAmount,
          feeAmount
        })
      }

      console.log('[pixWithdraw] Saldo suficiente, prosseguindo com o saque...')

      const typeMap = {
        cpf: 'CPF',
        CPF: 'CPF',
        cnpj: 'CNPJ',
        CNPJ: 'CNPJ',
        email: 'EMAIL',
        EMAIL: 'EMAIL',
        mobile: 'PHONE',
        MOBILE: 'PHONE',
        phone: 'PHONE',
        PHONE: 'PHONE',
        evp: 'EVP',
        EVP: 'EVP'
      }

      const mappedType = typeMap[value.keyType]

      const payerName =
        (value.extra?.payerName && String(value.extra.payerName).trim()) ||
        (user.name && String(user.name).trim()) ||
        'Cliente Mutual'

      const rawDoc = (user.document || user.cpf || user.cnpj || '').replace(/\D/g, '')

      const payerCPF =
        (value.extra?.payerCPF && String(value.extra.payerCPF).trim()) ||
        (rawDoc.length >= 11 ? rawDoc : '00000000000')

      let extra = {
        userId: user.id,
        document: payerCPF
      }


      if (mappedType === 'PHONE') {
        const cleanPhone = value.key.replace(/\D/g, '')
      
        if (cleanPhone.length !== 13) {
          throw new HttpError(400, 'InvalidPhoneKey', {
            message: 'Chave PIX telefone deve ter 13 dígitos (formato: 5511999999999). Exemplo: 5511999999999',
            receivedLength: cleanPhone.length,
            receivedValue: cleanPhone
          })
        }
        extra.bankAccount = cleanPhone
        extra.pixKeyType = 'PHONE'
        extra.accountName = payerName
        extra.document = payerCPF
      }

      if (!JWT_OPERATOR_SECRET) {
        throw new HttpError(500, 'MissingOperatorSecret', {
          message: 'JWT_OPERATOR_SECRET não configurado no ambiente deste serviço.'
        })
      }

      const operatorToken = jwt.sign(
        {
          type: 'OPERATOR',
          sub: GATEWAY_OPERATOR_ID
        },
        JWT_OPERATOR_SECRET,
        { expiresIn: '5m' }
      )

      const finalOrderId = value.orderId || `withdraw-${user.id}-${Date.now()}`
      let accountNumber = value.key
      
      if (mappedType === 'CPF' || mappedType === 'CNPJ') {
    
        accountNumber = value.key.replace(/\D/g, '')
      } else if (mappedType === 'PHONE') {
      
        const cleanPhone = value.key.replace(/\D/g, '')
        if (cleanPhone.length !== 13) {
          throw new HttpError(400, 'InvalidPhoneKey', {
            message: 'Chave PIX telefone deve ter 13 dígitos (formato: 5511999999999). Exemplo: 5511999999999',
            receivedLength: cleanPhone.length,
            receivedValue: cleanPhone
          })
        }
        accountNumber = cleanPhone
      } else if (mappedType === 'EMAIL') {
      
        accountNumber = value.key.trim()
      } else {

        accountNumber = value.key
      }
      

      const gatewayPayload = {
        orderId: finalOrderId, 
        userId: Number(user.id), 
        amount: Number(withdrawAmount), 
        accountNumber: accountNumber, 
        accountType: mappedType, 
        accountHolder: { 
          name: payerName,
          document: payerCPF
        }
      }
      
  
      if (value.bankCode) {
        gatewayPayload.bankCode = String(value.bankCode)
      }
      
      const internalExtra = {
        ...(extra || {}),
        userId: Number(user.id),
        calculatedFee: {
          originalAmount: withdrawAmount,
          totalAmount,
          feeAmount,
          netAmount
        },
        orderId: finalOrderId
      }

      console.log('[pixWithdraw] Enviando requisição para o gateway:', {
        gatewayUrl: `${GATEWAY_BASE_URL}/api/withdraw`,
        orderId: finalOrderId,
        amount: withdrawAmount,
        totalAmount,
        feeAmount,
        netAmount,
        accountType: mappedType,
        accountNumber: accountNumber.substring(0, 10) + '...', 
        payload: JSON.stringify(gatewayPayload, null, 2)
      })

      const gatewayUrl = `${GATEWAY_BASE_URL}/api/withdraw`
      const r = await axios.post(gatewayUrl, gatewayPayload, {
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!r.data || r.status >= 300) {
        console.error('[pixWithdraw]  Erro no gateway:', {
          status: r.status,
          data: r.data,
          payload: JSON.stringify(gatewayPayload, null, 2)
        })

        const errorDetails = r.data?.details || r.data?.message || 'Erro desconhecido do gateway'
        throw new HttpError(502, 'GatewayPixWithdrawFailed', {
          provider: r.data,
          details: errorDetails,
          status: r.status
        })
      }

      const g = r.data || {}


      const gatewayOrderId = g.providerOrderId || g.orderId || g.id || g.providerOrderNo || finalOrderId
      const gatewayStatus = g.status || 'PENDING'

      console.log('[pixWithdraw]  Saque criado no gateway com sucesso:', {
        orderId: finalOrderId,
        gatewayOrderId,
        gatewayStatus,
        gatewayResponse: g,
        totalAmount,
        feeAmount,
        netAmount,
        note: 'O débito será processado quando o webhook confirmar a transação'
      })

      try {
        await WebhookLogModel.insert({
          event_type: 'PIX_WITHDRAW',
          transaction_id: gatewayOrderId || finalOrderId,
          target_url: user.webhook_url || req.headers['x-webhook-url'] || null,
          status: 'pending',
          payload: {
            userId: user.id,
            amount: withdrawAmount,
            fee: { totalAmount, feeAmount, netAmount },
            gatewayPayload,
            internalExtra
          }
        })
      } catch (e) {
        console.log('[pixWithdraw] webhook_logs insert failed:', e?.message)
      }

      return res.json({
        ok: true,
        orderId: gatewayOrderId || finalOrderId,
        orderNo: gatewayOrderId || finalOrderId,
        status: gatewayStatus,
        providerOrderId: gatewayOrderId,
        merOrderNo: finalOrderId,
        gateway: g,
        calculatedFee: {
          originalAmount: withdrawAmount,
          totalAmount,
          feeAmount,
          netAmount
        },
        amount: withdrawAmount,
        note: 'O débito será processado quando o webhook confirmar a transação'
      })
    } catch (err) {
      console.error('[pixWithdraw] Erro ao criar saque Pix:', err);

      if (err.response && err.response.data) {
        const gatewayError = err.response.data
        console.error('[pixWithdraw] Erro detalhado do gateway:', {
          status: err.response.status,
          error: gatewayError,
          details: gatewayError.details
        })

        return res.status(err.response.status || 400).json({
          ok: false,
          error: gatewayError.error || 'GatewayError',
          message: gatewayError.message || 'Erro ao processar saque no gateway',
          details: gatewayError.details || gatewayError
        })
      }

      if (err instanceof HttpError) {
        return res.status(err.statusCode || 400).json({
          ok: false,
          error: err.code || 'HttpError',
          message: err.message,
          details: err.extra || undefined
        })
      }

      return res.status(500).json({
        details: err.message || 'Erro desconhecido',
        ok: false,
        error: 'Error',
        message: 'Falha ao criar saque Pix pelo user-service.'
      })
    }
  }


  async pixRefund(req, res, next) {
    try {
      const refundSchema = Joi.object({
        id: Joi.string().required(),
        clientReference: Joi.string().required(),
        endToEndId: Joi.string().optional(),
        description: Joi.string().optional(),
        callbackUrl: Joi.string().uri().optional()
      })

      const { value, error } = refundSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      if (!JWT_OPERATOR_SECRET) {
        throw new HttpError(500, 'MissingOperatorSecret', {
          message: 'JWT_OPERATOR_SECRET não configurado no ambiente deste serviço.'
        })
      }

      const operatorToken = jwt.sign(
        {
          type: 'OPERATOR',
          sub: GATEWAY_OPERATOR_ID
        },
        JWT_OPERATOR_SECRET,
        { expiresIn: '5m' }
      )

      const gatewayPayload = {
        id: value.id,
        clientReference: value.clientReference,
        endToEndId: value.endToEndId || null,
        description: value.description || null,
        callbackUrl: value.callbackUrl || null
      }

      console.log('[pixRefund] Enviando requisição para o gateway:', {
        gatewayUrl: `${GATEWAY_BASE_URL}/api/payzu/refund`,
        payload: JSON.stringify(gatewayPayload, null, 2)
      })

      const gatewayUrl = `${GATEWAY_BASE_URL}/api/payzu/refund`
      const r = await axios.post(gatewayUrl, gatewayPayload, {
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!r.data || r.status >= 300) {
        console.error('[pixRefund]  Erro no gateway:', {
          status: r.status,
          data: r.data,
          payload: JSON.stringify(gatewayPayload, null, 2)
        })

        const errorDetails = r.data?.details || r.data?.message || 'Erro desconhecido do gateway'
        throw new HttpError(502, 'GatewayPixRefundFailed', {
          provider: r.data,
          details: errorDetails,
          status: r.status
        })
      }

      console.log('[pixRefund]  Reembolso processado no gateway com sucesso:', {
        response: r.data
      })

      return res.json({
        ok: true,
        ...r.data
      })
    } catch (err) {
      console.error('[pixRefund] Erro ao processar reembolso Pix:', err)

  
      if (err.response && err.response.data) {
        const gatewayError = err.response.data
        console.error('[pixRefund] Erro detalhado do gateway:', {
          status: err.response.status,
          error: gatewayError,
          details: gatewayError.details
        })

        return res.status(err.response.status || 400).json({
          ok: false,
          error: gatewayError.error || 'GatewayError',
          message: gatewayError.message || 'Erro ao processar reembolso no gateway',
          details: gatewayError.details || gatewayError
        })
      }

      if (err instanceof HttpError) {
        return res.status(err.statusCode || 400).json({
          ok: false,
          error: err.code || 'HttpError',
          message: err.message,
          details: err.extra || undefined
        })
      }

      return res.status(500).json({
        details: err.message || 'Erro desconhecido',
        ok: false,
        error: 'Error',
        message: 'Falha ao processar reembolso Pix pelo user-service.'
      })
    }
  }
  async getHouseWallet(currency = 'BRL') {
    console.log('[getHouseWallet] === INÍCIO ===', {
      currency,
      timestamp: new Date().toISOString()
    })

    const finalCurrency = (currency || 'BRL').toUpperCase()

    let houseUserId = null


    console.log('[getHouseWallet] Buscando usuário de tesouraria via findTreasuryUser...')
    try {
      const treasuryUser = await UserModel.findTreasuryUser()
      if (treasuryUser && treasuryUser.id) {
        houseUserId = treasuryUser.id
        console.log('[getHouseWallet]  Usuário de tesouraria encontrado via findTreasuryUser (is_treasury=TRUE):', {
          userId: houseUserId,
          name: treasuryUser.name,
          email: treasuryUser.email
        })
      }
    } catch (err) {
      console.log('[getHouseWallet]  Erro ao buscar via findTreasuryUser (campo is_treasury pode não existir):', err.message)
    }

    
    if (!houseUserId || Number.isNaN(houseUserId)) {
      const raw = env.HOUSE_USER_ID
      houseUserId = raw ? parseInt(raw, 10) : null
      if (houseUserId && !Number.isNaN(houseUserId)) {
        console.log('[getHouseWallet]  Usuário de tesouraria obtido via env.HOUSE_USER_ID:', houseUserId)
      } else {
        console.log('[getHouseWallet]  env.HOUSE_USER_ID não configurado ou inválido:', raw)
      }
    }

    if (!houseUserId || Number.isNaN(houseUserId)) {
      console.error('[getHouseWallet]  Nenhum usuário de tesouraria encontrado!')
      throw new HttpError(500, 'HouseUserNotConfigured', {
        message: 'Nenhum usuário de tesouraria encontrado. Configure HOUSE_USER_ID no .env ou defina is_treasury=TRUE no banco.'
      })
    }


    const user = await UserModel.findById(houseUserId)
    if (!user) {
      console.error('[getHouseWallet]  Usuário de tesouraria não encontrado no banco:', houseUserId)
      throw new HttpError(500, 'HouseUserNotFound', {
        message: `Usuário de tesouraria com ID ${houseUserId} não encontrado no banco de dados`
      })
    }

    console.log('[getHouseWallet] Obtendo ou criando wallet da tesouraria...', {
      houseUserId,
      currency: finalCurrency,
      userName: user.name
    })

    const wallet = await WalletModel.getOrCreateHouseWallet(houseUserId, finalCurrency)


    if (wallet && wallet.type !== 'HOUSE') {
      console.error('[getHouseWallet]  Wallet encontrada não é do tipo HOUSE!', {
        walletId: wallet.id,
        walletType: wallet.type,
        expectedType: 'HOUSE'
      })
      throw new HttpError(500, 'InvalidHouseWalletType', {
        message: `Wallet encontrada não é do tipo HOUSE. Tipo atual: ${wallet.type}`
      })
    }

    console.log('[getHouseWallet]  Wallet da tesouraria obtida com sucesso:', {
      walletId: wallet?.id,
      userId: wallet?.user_id,
      walletType: wallet?.type,
      balance: wallet?.balance,
      currency: wallet?.currency,
      isHouseWallet: wallet?.type === 'HOUSE'
    })

    return wallet
  }

  /**
   * Calcula a taxa de PIX IN (apenas cálculo, não aplica transações)
   * @param {number} userId - ID do usuário
   * @param {number} originalAmount - Valor original do depósito
   * @returns {Promise<{netAmount: number, feeAmount: number, totalAmount: number}>}
   */
  async calculatePixInFee(userId, originalAmount) {
    console.log('[calculatePixInFee] === INÍCIO ===', {
      userId,
      originalAmount,
      timestamp: new Date().toISOString()
    })

    try {
   
      console.log('[calculatePixInFee] Buscando taxas para userId:', userId)
      const fees = await UserFeeModel.getByUserId(userId)
      console.log('[calculatePixInFee] Taxas encontradas:', fees ? {
        pix_in_fee_type: fees.pix_in_fee_type,
        pix_in_fee_value: fees.pix_in_fee_value,
        pix_in_percent: fees.pix_in_percent
      } : 'Nenhuma taxa configurada')

      let feeAmount = 0

      if (fees) {
        feeAmount = UserFeeModel.calculatePixInFee(originalAmount, fees)
        console.log('[calculatePixInFee] Taxa calculada (fixa + percentual):', {
          feeAmount,
          pix_in_fee_type: fees.pix_in_fee_type,
          pix_in_fee_value: fees.pix_in_fee_value,
          pix_in_percent: fees.pix_in_percent
        })
      } else {
        console.log('[calculatePixInFee]  Nenhuma taxa configurada para o usuário')
      }

      const netAmount = originalAmount - feeAmount
      const totalAmount = originalAmount

      console.log('[calculatePixInFee] Valores calculados:', {
        originalAmount,
        feeAmount,
        netAmount,
        totalAmount
      })

      console.log('[calculatePixInFee] === SUCESSO ===')
      return { netAmount, feeAmount, totalAmount }
    } catch (err) {
      console.error('[calculatePixInFee] ERRO GERAL:', {
        error: err.message,
        stack: err.stack,
        userId,
        originalAmount
      })
  
      return { netAmount: originalAmount, feeAmount: 0, totalAmount: originalAmount }
    }
  }

  /**
   * Calcula a taxa de PIX OUT (apenas cálculo, não aplica transações)
   * @param {number} userId - ID do usuário
   * @param {number} originalAmount - Valor original do saque
   * @returns {Promise<{totalAmount: number, feeAmount: number, netAmount: number}>}
   */
  async calculatePixOutFee(userId, originalAmount) {
    console.log('[calculatePixOutFee] === INÍCIO ===', {
      userId,
      originalAmount,
      timestamp: new Date().toISOString()
    })

    try {
      console.log('[calculatePixOutFee] Buscando taxas para userId:', userId)
      const fees = await UserFeeModel.getByUserId(userId)
      console.log('[calculatePixOutFee] Taxas encontradas:', fees ? {
        pix_out_fee_type: fees.pix_out_fee_type,
        pix_out_fee_value: fees.pix_out_fee_value,
        pix_out_percent: fees.pix_out_percent
      } : 'Nenhuma taxa configurada')

      let feeAmount = 0

      if (fees) {
        feeAmount = UserFeeModel.calculatePixOutFee(originalAmount, fees)
        console.log('[calculatePixOutFee] Taxa calculada (fixa + percentual):', {
          feeAmount,
          pix_out_fee_type: fees.pix_out_fee_type,
          pix_out_fee_value: fees.pix_out_fee_value,
          pix_out_percent: fees.pix_out_percent
        })
      } else {
        console.log('[calculatePixOutFee]  Nenhuma taxa configurada para o usuário')
      }
      const totalAmount = originalAmount + feeAmount
    
      const netAmount = originalAmount

      console.log('[calculatePixOutFee] Valores calculados:', {
        originalAmount,
        feeAmount,
        totalAmount,
        netAmount
      })

      console.log('[calculatePixOutFee] === SUCESSO ===')
      return { totalAmount, feeAmount, netAmount }
    } catch (err) {
      console.error('[calculatePixOutFee]  ERRO GERAL:', {
        error: err.message,
        stack: err.stack,
        userId,
        originalAmount
      })
      return { totalAmount: originalAmount, feeAmount: 0, netAmount: originalAmount }
    }
  }
}

export const walletController = new WalletController()