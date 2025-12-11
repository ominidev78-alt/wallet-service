import Joi from 'joi'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { UserModel } from '../models/UserModel.js'
import { LedgerModel } from '../models/LedgerModel.js'
import { HttpError } from '../core/HttpError.js'
import { WalletModel } from '../models/WalletModel.js'
import { GatewayTransactionModel } from '../models/GatewayTransactionModel.js'
import { UserFeeModel } from '../models/UserFeeModel.js'
import { TwoFactorAuthModel } from '../models/TwoFactorAuthModel.js'
import { WebhookLogModel } from '../models/WebhookLogModel.js'
import { TotpService } from '../services/TotpService.js'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'


const mutateSchema = Joi.object({
  amount: Joi.number().positive().required(),
  description: Joi.string().allow('', null),
  meta: Joi.object().unknown(true).default({}),
  external_id: Joi.string().required()
})

const GATEWAY_BASE_URL = env.GATEWAY_BASE_URL || 'https://payg2a.online'

const GATEWAY_OPERATOR_ID = Number(env.GATEWAY_OPERATOR_ID || 1)
const JWT_OPERATOR_SECRET = env.JWT_OPERATOR_SECRET || 'mutual-secret-2025'

function buildStandardWebhookPayload(transactionType, data) {
  const basePayload = {
    merOrderNo: data.merOrderNo || null,
    orderNo: data.orderNo || null,
    tradeNo: data.tradeNo || null,
    status: data.status || (transactionType === 'DEPOSIT' || transactionType === 'PIX_IN' ? 'waiting_payment' : 'pending'),
    amount: data.amount || data.totalAmount || 0,
    userId: data.userId || null,
    type: transactionType === 'DEPOSIT' || transactionType === 'PIX_IN' ? 'DEPOSIT' : 'WITHDRAW',
    timestamp: new Date().toISOString()
  }

  if (transactionType === 'DEPOSIT' || transactionType === 'PIX_IN') {
    basePayload.netAmount = data.netAmount || null
    basePayload.feeAmount = data.feeAmount || null
    basePayload.totalAmount = data.totalAmount || data.amount || null
  } else {
    basePayload.netAmount = data.netAmount || null
    basePayload.feeAmount = data.feeAmount || null
    basePayload.totalAmount = data.totalAmount || null
  }

  if (data.externalId) {
    basePayload.externalId = data.externalId
  }

  return basePayload
}

async function sendWebhookToUser(user, transactionType, data) {
  let targetUrl = null

  if (transactionType === 'DEPOSIT' || transactionType === 'PIX_IN') {
    targetUrl = user.webhook_url_pix_in || user.webhook_url || null
  } else if (transactionType === 'WITHDRAW' || transactionType === 'PIX_OUT') {
    targetUrl = user.webhook_url_pix_out || user.webhook_url || null
  } else {
    targetUrl = user.webhook_url || null
  }

  if (!targetUrl) {
    console.log('[sendWebhookToUser] Nenhuma URL de webhook configurada para o usuário:', user.id)
    return null
  }

  const payload = buildStandardWebhookPayload(transactionType, data)

  const start = Date.now()
  try {
    const response = await axios.post(targetUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    })
    const latency = Date.now() - start

    WebhookLogModel.insert({
      event_type: transactionType === 'DEPOSIT' || transactionType === 'PIX_IN' ? 'PIX_DEPOSIT_WEBHOOK' : 'PIX_WITHDRAW_WEBHOOK',
      transaction_id: payload.orderNo || payload.tradeNo || payload.merOrderNo || null,
      target_url: targetUrl,
      http_status: response.status,
      latency_ms: latency,
      status: response.status >= 200 && response.status < 300 ? 'delivered' : 'failed',
      payload: payload,
      response_body: JSON.stringify(response.data || null),
      error: null
    }).catch(err => console.error('[sendWebhookToUser] Erro ao registrar log:', err.message))

    console.log('[sendWebhookToUser] ✅ Webhook enviado com sucesso:', {
      userId: user.id,
      transactionType,
      targetUrl,
      status: response.status,
      latency
    })

    return { success: true, status: response.status, latency }
  } catch (error) {
    const latency = Date.now() - start
    const status = error.response?.status || null
    const responseBody = error.response?.data ? JSON.stringify(error.response.data) : null

    WebhookLogModel.insert({
      event_type: transactionType === 'DEPOSIT' || transactionType === 'PIX_IN' ? 'PIX_DEPOSIT_WEBHOOK' : 'PIX_WITHDRAW_WEBHOOK',
      transaction_id: payload.orderNo || payload.tradeNo || payload.merOrderNo || null,
      target_url: targetUrl,
      http_status: status,
      latency_ms: latency,
      status: 'failed',
      payload: payload,
      response_body: responseBody,
      error: error.message || 'Request failed'
    }).catch(err => console.error('[sendWebhookToUser] Erro ao registrar log:', err.message))

    console.error('[sendWebhookToUser] ❌ Erro ao enviar webhook:', {
      userId: user.id,
      transactionType,
      targetUrl,
      error: error.message,
      status
    })

    return { success: false, status, error: error.message }
  }
}

export class WalletController {
  async getBalance(req, res, next) {
    try {
      const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
      const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

      let userId = null
      let user = null

      if (req.params.id) {
        userId = Number(req.params.id)
        user = await UserModel.findById(userId)
        if (!user) throw new HttpError(404, 'UserNotFound')
      } else {
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

  //Rotas para consultar status de transações
  //######## PAULO MECHENDO ############ ##
  async getDepositStatus(req, res) {
    try {
      const orderNo = req.params.orderNo
      const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
      const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

      if (!appId || !clientId) {
        return res.status(400).json({ ok: false, error: 'MissingHeaders', message: 'app_id e client_id são obrigatórios.' })
      }

      const user = await UserModel.findByAppId(appId)
      if (!user || (clientId !== appId && clientId !== user.client_secret)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }

      let wallet = await WalletModel.getUserWallet(user.id, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(user.id, 'BRL')

      let rows = []
      try {
        const q = await pool.query(
          "SELECT id, direction, amount, meta, external_id, created_at FROM ledger_entries WHERE wallet_id = $1 AND direction = 'CREDIT' AND (meta->>'merOrderNo' = $2 OR meta->>'orderNo' = $2 OR meta->>'tradeNo' = $2 OR meta->>'e2e' = $2) ORDER BY id DESC LIMIT 1;",
          [wallet.id, orderNo]
        )
        rows = q.rows || []
      } catch {}

      let entry = rows[0]
      if (!entry) {
        try {
          const operatorToken = jwt.sign({ type: 'OPERATOR', sub: GATEWAY_OPERATOR_ID }, JWT_OPERATOR_SECRET, { expiresIn: '3m' })
          const resp = await axios.get(`${GATEWAY_BASE_URL}/api/deposit/status/${encodeURIComponent(orderNo)}` , { headers: { Authorization: `Bearer ${operatorToken}` } })
          return res.json({ ok: true, source: 'gateway', data: resp.data })
        } catch {}
      }

      const status = entry ? 'paid' : 'waiting_payment'
      return res.json({ ok: true, orderNo, status, entry })
    } catch (err) {
      console.error('[getDepositStatus] Error:', err)
      return res.status(500).json({ ok: false, error: 'DepositStatusFailed' })
    }
  }

  async getWithdrawStatus(req, res) {
    try {
      const orderNo = req.params.orderNo
      const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
      const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

      if (!appId || !clientId) {
        return res.status(400).json({ ok: false, error: 'MissingHeaders', message: 'app_id e client_id são obrigatórios.' })
      }

      const user = await UserModel.findByAppId(appId)
      if (!user || (clientId !== appId && clientId !== user.client_secret)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }

      let wallet = await WalletModel.getUserWallet(user.id, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(user.id, 'BRL')

      let rows = []
      try {
        const q = await pool.query(
          "SELECT id, direction, amount, meta, external_id, created_at FROM ledger_entries WHERE wallet_id = $1 AND direction = 'DEBIT' AND (meta->>'merOrderNo' = $2 OR meta->>'orderNo' = $2 OR meta->>'tradeNo' = $2 OR meta->>'e2e' = $2) ORDER BY id DESC LIMIT 1;",
          [wallet.id, orderNo]
        )
        rows = q.rows || []
      } catch {}

      let entry = rows[0]
      if (!entry) {
        try {
          const operatorToken = jwt.sign({ type: 'OPERATOR', sub: GATEWAY_OPERATOR_ID }, JWT_OPERATOR_SECRET, { expiresIn: '3m' })
          const resp = await axios.get(`${GATEWAY_BASE_URL}/api/withdraw/status/${encodeURIComponent(orderNo)}` , { headers: { Authorization: `Bearer ${operatorToken}` } })
          return res.json({ ok: true, source: 'gateway', data: resp.data })
        } catch {}
      }

      const status = entry ? 'completed' : 'pending'
      return res.json({ ok: true, orderNo, status, entry })
    } catch (err) {
      console.error('[getWithdrawStatus] Error:', err)
      return res.status(500).json({ ok: false, error: 'WithdrawStatusFailed' })
    }
  }

  async getRefundStatus(req, res) {
    try {
      const refundNo = req.params.refundNo
      const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
      const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

      if (!appId || !clientId) {
        return res.status(400).json({ ok: false, error: 'MissingHeaders', message: 'app_id e client_id são obrigatórios.' })
      }

      const user = await UserModel.findByAppId(appId)
      if (!user || (clientId !== appId && clientId !== user.client_secret)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }

      try {
        const operatorToken = jwt.sign({ type: 'OPERATOR', sub: GATEWAY_OPERATOR_ID }, JWT_OPERATOR_SECRET, { expiresIn: '3m' })
        const resp = await axios.get(`${GATEWAY_BASE_URL}/api/payzu/refund/status/${encodeURIComponent(refundNo)}` , { headers: { Authorization: `Bearer ${operatorToken}` } })
        return res.json({ ok: true, source: 'gateway', data: resp.data })
      } catch (err) {
        return res.status(404).json({ ok: false, error: 'RefundNotFound' })
      }
    } catch (err) {
      console.error('[getRefundStatus] Error:', err)
      return res.status(500).json({ ok: false, error: 'RefundStatusFailed' })
    }
  }
  //Rotas para consultar status de transações
  //######## PAULO MECHENDO ############

  async ledger(req, res, next) {
    try {
      const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
      const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

      let userId = null
      let user = null

      const rawUserId =
        req.user?.id ||
        req.user?.userId ||
        req.user?.user_id ||
        req.params.id ||
        req.params.userId ||
        req.params.user_id

      if (rawUserId) {
        userId = typeof rawUserId === 'string' ? parseInt(rawUserId, 10) : rawUserId
        if (!Number.isFinite(userId) || userId <= 0) {
          throw new HttpError(400, 'InvalidUserId')
        }
        user = await UserModel.findById(userId)
        if (!user) throw new HttpError(404, 'UserNotFound')
      } else {
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
            // Tentar parsear como JSONB do PostgreSQL
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

        // Inicializar newMeta antes de usar
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

            // Incluir raw_response no meta para o front-end poder extrair todos os dados
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

        // Preservar descrição de taxa de transação
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
      // Headers OBRIGATÓRIOS para segurança
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

      const { amount, payerName, payerCPF } = req.body || {}

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

      const user = await UserModel.findByAppId(appId)

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

      const finalUserId = user.id

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

      const externalId = req.body.external_id || req.body.externalId || `mutual_${merOrderNo}-${crypto.randomUUID()}`

      const orderNo = d.orderNo || d.externalRef || null
      const tradeNo = d.tradeNo || d.endToEndId || null

      try {
        const { totalAmount, feeAmount, netAmount: calculatedNetAmount } = await this.calculatePixInFee(finalUserId, finalAmount)

        const webhookData = {
          merOrderNo,
          orderNo,
          tradeNo,
          status: 'waiting_payment',
          amount: totalAmount,
          netAmount: calculatedNetAmount,
          feeAmount,
          totalAmount,
          userId: finalUserId,
          externalId
        }

        sendWebhookToUser(user, 'DEPOSIT', webhookData).catch(err => {
          console.error('[pixDeposit] Erro ao enviar webhook imediato (não bloqueante):', err.message)
        })
      } catch (e) {
        console.log('[pixDeposit] Erro ao calcular taxa para webhook:', e?.message)
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

          // Registrar webhook entregue para PIX IN
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
      // Headers OBRIGATÓRIOS para segurança
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
        keyType: Joi.string().valid('cpf', 'cnpj', 'email', 'mobile', 'evp', 'CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP').required(),
        bankCode: Joi.string().optional(),
        extra: Joi.object().unknown(true).default({}),
        orderId: Joi.string().optional(),
        externalId: Joi.string().optional(),
        userId: Joi.number().optional()
      }).unknown(true)

      const { value, error } = pixWithdrawSchema.validate(req.body, {
        abortEarly: false
      })

      if (error) {
        throw new HttpError(400, 'ValidationError', { details: error.details })
      }

      if (!value || !value.amount) {
        throw new HttpError(400, 'InvalidRequest', { message: 'Valor do saque é obrigatório' })
      }

      if (value.keyType) {
        const normalizedKeyType = value.keyType.toLowerCase()
        if (normalizedKeyType === 'phone') {
          value.keyType = 'mobile'
        } else {
          value.keyType = normalizedKeyType
        }
      }

      const user = await UserModel.findByAppId(appId)

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

      const userId = user.id

      // Enforce 2FA enabled for withdrawals
      // NOTA: O código 2FA já é verificado no frontend através do endpoint /api/2fa/verify
      // antes de chamar este endpoint. Aqui apenas verificamos se o 2FA está ativado.
      const twofa = await TwoFactorAuthModel.findByUserId(Number(userId))
      const twofaEnabled = Boolean(twofa && twofa.enabled === true)

      if (!twofaEnabled) {
        return res.status(403).json({
          ok: false,
          error: 'TwoFactorRequired',
          message: 'Para realizar saques PIX, você precisa ativar o 2FA. Acesse a página de Segurança (2FA) para ativar.'
        })
      }

      // O código 2FA já foi verificado no frontend através do endpoint /api/2fa/verify
      // que possui toda a lógica de auditoria, bloqueio após tentativas, etc.
      // Não é necessário validar novamente aqui para evitar validação duplicada.

      // Obter wallet do usuário
      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      const withdrawAmount = Number(value.amount)

      if (!withdrawAmount || withdrawAmount <= 0) {
        throw new HttpError(400, 'InvalidAmount', { message: 'Valor do saque deve ser maior que zero' })
      }

      // Calcular taxa de PIX OUT
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

      // Validar saldo suficiente
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

      console.log('[pixWithdraw] ✅ Saldo suficiente, prosseguindo com o saque...')

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

      // Para chaves PHONE, adicionar informações extras
      if (mappedType === 'PHONE') {
        const cleanPhone = value.key.replace(/\D/g, '')
        // Validar que telefone tenha 13 dígitos (formato: 5511999999999)
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

      // Preparar payload do gateway
      // O gateway REQUER: orderId, accountNumber, accountType, accountHolder
      // O gateway NÃO ACEITA: pixKey, pixType, clientReference, callbackUrl

      // Preparar accountNumber (chave PIX) conforme o tipo
      let accountNumber = value.key

      if (mappedType === 'CPF' || mappedType === 'CNPJ') {
        // Chave CPF/CNPJ: remover formatação
        accountNumber = value.key.replace(/\D/g, '')
      } else if (mappedType === 'PHONE') {
        // Chave telefone: remover formatação e validar 13 dígitos
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
        // Chave EMAIL: usar como está
        accountNumber = value.key.trim()
      } else {
        // EVP (chave aleatória): usar como está
        accountNumber = value.key
      }

      // Montar payload conforme formato esperado pelo gateway
      const gatewayPayload = {
        orderId: finalOrderId, // Obrigatório
        userId: Number(user.id), // Garantir que userId seja enviado para salvar na transação
        amount: Number(withdrawAmount), // Valor líquido a ser enviado (sem taxa)
        accountNumber: accountNumber, // Obrigatório - chave PIX de destino
        accountType: mappedType, // Obrigatório - tipo da chave (CPF, CNPJ, EMAIL, PHONE, EVP)
        accountHolder: { // Obrigatório
          name: payerName,
          document: payerCPF
        }
      }

      // Adicionar campos opcionais se necessário
      if (value.bankCode) {
        gatewayPayload.bankCode = String(value.bankCode)
      }

      // Manter informações extras no objeto separado para uso interno (não enviar ao gateway)
      const internalExtra = {
        ...(extra || {}),
        userId: Number(user.id),
        // Informações de taxa para o webhook processar
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
        accountNumber: accountNumber.substring(0, 10) + '...', // Log parcial da chave por segurança
        payload: JSON.stringify(gatewayPayload, null, 2)
      })

      const gatewayUrl = `${GATEWAY_BASE_URL}/api/withdraw`
      const r = await axios.post(gatewayUrl, gatewayPayload, {
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout to prevent Cloudflare 524 errors
      })

      if (!r.data || r.status >= 300) {
        console.error('[pixWithdraw] ❌ Erro no gateway:', {
          status: r.status,
          data: r.data,
          payload: JSON.stringify(gatewayPayload, null, 2)
        })

        // Se houver detalhes de validação, incluir na mensagem
        const errorDetails = r.data?.details || r.data?.message || 'Erro desconhecido do gateway'
        throw new HttpError(502, 'GatewayPixWithdrawFailed', {
          provider: r.data,
          details: errorDetails,
          status: r.status
        })
      }

      const g = r.data || {}

      // Extrair orderId e status da resposta do gateway
      const gatewayOrderId = g.providerOrderId || g.orderId || g.id || g.providerOrderNo || finalOrderId
      const gatewayStatus = g.status || 'PENDING'

      console.log('[pixWithdraw] ✅ Saque criado no gateway com sucesso:', {
        orderId: finalOrderId,
        gatewayOrderId,
        gatewayStatus,
        gatewayResponse: g,
        totalAmount,
        feeAmount,
        netAmount,
        note: 'O débito será processado quando o webhook confirmar a transação'
      })

      // Registrar tentativa de webhook para PIX OUT criado (pendente)
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

      // Handle axios timeout errors specifically
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        console.error('[pixWithdraw] ❌ Timeout ao comunicar com o gateway:', {
          timeout: '30s',
          gatewayUrl: `${GATEWAY_BASE_URL}/api/withdraw`
        })
        return res.status(504).json({
          ok: false,
          error: 'GatewayTimeout',
          message: 'O gateway de pagamento está demorando para responder. Por favor, tente novamente em alguns instantes.',
          details: 'Timeout após 30 segundos'
        })
      }

      // Se for erro do axios com resposta do gateway
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

  /**
   * Processa reembolso (refund) via API Gateway
   */
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
        console.error('[pixRefund] ❌ Erro no gateway:', {
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

      console.log('[pixRefund] ✅ Reembolso processado no gateway com sucesso:', {
        response: r.data
      })

      return res.json({
        ok: true,
        ...r.data
      })
    } catch (err) {
      console.error('[pixRefund] Erro ao processar reembolso Pix:', err)

      // Se for erro do axios com resposta do gateway
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

  /**
   * Obtém a wallet da tesouraria (HOUSE)
   */
  async getHouseWallet(currency = 'BRL') {
    console.log('[getHouseWallet] === INÍCIO ===', {
      currency,
      timestamp: new Date().toISOString()
    })

    const finalCurrency = (currency || 'BRL').toUpperCase()

    let houseUserId = null

    // Prioridade 1: Buscar usuário com is_treasury = TRUE
    console.log('[getHouseWallet] Buscando usuário de tesouraria via findTreasuryUser...')
    try {
      const treasuryUser = await UserModel.findTreasuryUser()
      if (treasuryUser && treasuryUser.id) {
        houseUserId = treasuryUser.id
        console.log('[getHouseWallet] ✅ Usuário de tesouraria encontrado via findTreasuryUser (is_treasury=TRUE):', {
          userId: houseUserId,
          name: treasuryUser.name,
          email: treasuryUser.email
        })
      }
    } catch (err) {
      console.log('[getHouseWallet] ⚠️ Erro ao buscar via findTreasuryUser (campo is_treasury pode não existir):', err.message)
    }

    // Prioridade 2: Usar HOUSE_USER_ID do .env
    if (!houseUserId || Number.isNaN(houseUserId)) {
      const raw = env.HOUSE_USER_ID
      houseUserId = raw ? parseInt(raw, 10) : null
      if (houseUserId && !Number.isNaN(houseUserId)) {
        console.log('[getHouseWallet] ✅ Usuário de tesouraria obtido via env.HOUSE_USER_ID:', houseUserId)
      } else {
        console.log('[getHouseWallet] ⚠️ env.HOUSE_USER_ID não configurado ou inválido:', raw)
      }
    }

    if (!houseUserId || Number.isNaN(houseUserId)) {
      console.error('[getHouseWallet] ❌ Nenhum usuário de tesouraria encontrado!')
      throw new HttpError(500, 'HouseUserNotConfigured', {
        message: 'Nenhum usuário de tesouraria encontrado. Configure HOUSE_USER_ID no .env ou defina is_treasury=TRUE no banco.'
      })
    }

    // Verificar se o usuário existe
    const user = await UserModel.findById(houseUserId)
    if (!user) {
      console.error('[getHouseWallet] ❌ Usuário de tesouraria não encontrado no banco:', houseUserId)
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

    // Verificar se a wallet tem type = 'HOUSE'
    if (wallet && wallet.type !== 'HOUSE') {
      console.error('[getHouseWallet] ❌ Wallet encontrada não é do tipo HOUSE!', {
        walletId: wallet.id,
        walletType: wallet.type,
        expectedType: 'HOUSE'
      })
      throw new HttpError(500, 'InvalidHouseWalletType', {
        message: `Wallet encontrada não é do tipo HOUSE. Tipo atual: ${wallet.type}`
      })
    }

    console.log('[getHouseWallet] ✅ Wallet da tesouraria obtida com sucesso:', {
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
      // Buscar taxas do usuário
      console.log('[calculatePixInFee] Buscando taxas para userId:', userId)
      const fees = await UserFeeModel.getByUserId(userId)
      console.log('[calculatePixInFee] Taxas encontradas:', fees ? {
        pix_in_fee_type: fees.pix_in_fee_type,
        pix_in_fee_value: fees.pix_in_fee_value,
        pix_in_percent: fees.pix_in_percent
      } : 'Nenhuma taxa configurada')

      let feeAmount = 0

      if (fees) {
        // Calcular taxa fixa + percentual
        feeAmount = UserFeeModel.calculatePixInFee(originalAmount, fees)
        console.log('[calculatePixInFee] Taxa calculada (fixa + percentual):', {
          feeAmount,
          pix_in_fee_type: fees.pix_in_fee_type,
          pix_in_fee_value: fees.pix_in_fee_value,
          pix_in_percent: fees.pix_in_percent
        })
      } else {
        console.log('[calculatePixInFee] ⚠️ Nenhuma taxa configurada para o usuário')
      }

      // Para depósito: valor líquido = original - taxa
      const netAmount = originalAmount - feeAmount
      // totalAmount = originalAmount (valor depositado)
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
      console.error('[calculatePixInFee] ❌ ERRO GERAL:', {
        error: err.message,
        stack: err.stack,
        userId,
        originalAmount
      })
      // Em caso de erro, retornar o valor original sem taxa
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
      // Buscar taxas do usuário
      console.log('[calculatePixOutFee] Buscando taxas para userId:', userId)
      const fees = await UserFeeModel.getByUserId(userId)
      console.log('[calculatePixOutFee] Taxas encontradas:', fees ? {
        pix_out_fee_type: fees.pix_out_fee_type,
        pix_out_fee_value: fees.pix_out_fee_value,
        pix_out_percent: fees.pix_out_percent
      } : 'Nenhuma taxa configurada')

      let feeAmount = 0

      if (fees) {
        // Calcular taxa fixa + percentual
        feeAmount = UserFeeModel.calculatePixOutFee(originalAmount, fees)
        console.log('[calculatePixOutFee] Taxa calculada (fixa + percentual):', {
          feeAmount,
          pix_out_fee_type: fees.pix_out_fee_type,
          pix_out_fee_value: fees.pix_out_fee_value,
          pix_out_percent: fees.pix_out_percent
        })
      } else {
        console.log('[calculatePixOutFee] ⚠️ Nenhuma taxa configurada para o usuário')
      }

      // Para saque: valor total debitado = original + taxa
      const totalAmount = originalAmount + feeAmount
      // netAmount = originalAmount (valor que será enviado)
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
      console.error('[calculatePixOutFee] ❌ ERRO GERAL:', {
        error: err.message,
        stack: err.stack,
        userId,
        originalAmount
      })
      // Em caso de erro, retornar o valor original sem taxa
      return { totalAmount: originalAmount, feeAmount: 0, netAmount: originalAmount }
    }
  }
  async credit(req, res, next) {
    return this.mutateCredit(req, res, next)
  }

  async debit(req, res, next) {
    return this.mutateDebit(req, res, next)
  }
}

export const walletController = new WalletController()