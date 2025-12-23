import Joi from 'joi'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { userService, httpClient, webhookService } from '../app.js'
import { LedgerModel } from '../models/LedgerModel.js'
import { HttpError } from '../core/HttpError.js'
import { WalletModel } from '../models/WalletModel.js'
import { GatewayTransactionModel } from '../models/GatewayTransactionModel.js'
import { env } from '../config/env.js'

const mutateSchema = Joi.object({
  amount: Joi.number().positive().required(),
  description: Joi.string().allow('', null),
  meta: Joi.object().unknown(true).default({}),
  external_id: Joi.string().required()
})

const GATEWAY_BASE_URL = env.GATEWAY_BASE_URL || 'https://payg2a.online'
const GATEWAY_OPERATOR_ID = Number(env.GATEWAY_OPERATOR_ID || 1)
const JWT_OPERATOR_SECRET = env.JWT_OPERATOR_SECRET || 'pagandu-secret-2025'

function buildStandardWebhookPayload(transactionType, data) {
  const externalId = data.externalId || null
  const merOrderNo = data.merOrderNo || null

  return {
    type: transactionType === 'DEPOSIT' || transactionType === 'PIX_IN' ? 'DEPOSIT' : 'WITHDRAW',
    amount: data.amount || data.totalAmount || 0,
    status: data.status || (transactionType === 'DEPOSIT' || transactionType === 'PIX_IN' ? 'waiting_payment' : 'pending'),
    userId: data.userId || null,
    orderNo: data.orderNo || externalId || null,
    tradeNo: data.tradeNo || merOrderNo || null,
    feeAmount: data.feeAmount || null,
    netAmount: data.netAmount || null,
    endToEnd: data.endToEnd || null,
    payerName: data.payerName || null,
    receiverName: data.receiverName || null,
    payerDocument: data.payerDocument || null,
    receiverDocument: data.receiverDocument || null,
    timestamp: data.timestamp || new Date().toISOString(),
    externalId: externalId,
    merOrderNo: merOrderNo,
    totalAmount: data.totalAmount || data.amount || null,
    uuid: data.uuid || data.orderNo || null,
    documentNumber: data.documentNumber || data.receiverDocument || data.payerDocument || null
  }
}

export async function sendWebhookToUser(user, transactionType, data, retryCount = 0, options = {}) {
  // In a real microservice, this might delegate to a webhook-service.
  // For now, we use the webhookService axios instance.
  try {
    const targetUrl = (transactionType === 'DEPOSIT' || transactionType === 'PIX_IN')
      ? (user.webhook_url_pix_in || user.webhook_url)
      : (user.webhook_url_pix_out || user.webhook_url)

    if (!targetUrl) return { success: false, error: 'No webhook URL' }

    let payload = options?.useRawPayload ? (data || {}) : buildStandardWebhookPayload(transactionType, data)

    // Enriquecimento básico se necessário (chamando gateway-transactions no mesmo banco da wallet)
    if (['DEPOSIT', 'PIX_IN'].includes(transactionType) && data.merOrderNo) {
      const originalTransaction = await GatewayTransactionModel.findByMerOrderNo(data.merOrderNo)
      if (originalTransaction) {
        payload = { ...(originalTransaction.raw_pagandu || {}), ...payload }
      }
    }

    const response = await httpClient.post(targetUrl, payload, { timeout: 10000 })
    return { success: true, status: response.status }
  } catch (err) {
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 2000))
      return sendWebhookToUser(user, transactionType, data, retryCount + 1, options)
    }
    return { success: false, error: err.message }
  }
}

export class WalletController {
  /**
   * Helper to validate credentials via user-service
   */
  async #validateCredentials(req) {
    const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
    const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

    if (!appId || !clientId) {
      throw new HttpError(400, 'MissingHeaders', { message: 'app_id e client_id são obrigatórios.' })
    }

    try {
      const resp = await userService.post('/internal/validate-credentials', {
        app_id: appId,
        app_secret: clientId
      })
      if (!resp.data?.ok) throw new HttpError(401, 'Unauthorized')
      return resp.data.user
    } catch (err) {
      if (err.response?.status === 401) throw new HttpError(401, 'Unauthorized')
      throw err
    }
  }

  async getBalance(req, res, next) {
    try {
      let userId = null
      if (req.params.id) {
        userId = Number(req.params.id)
      } else {
        const user = await this.#validateCredentials(req)
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

  async getDepositStatus(req, res) {
    try {
      const orderNo = req.params.orderNo
      const user = await this.#validateCredentials(req)
      const transaction = await GatewayTransactionModel.findByExternalId(orderNo)
      if (!transaction) return res.status(404).json({ ok: false, error: 'TransactionNotFound' })
      return res.json({ ok: true, ...transaction.raw_pagandu })
    } catch (err) {
      return res.status(err.status || 500).json({ ok: false, error: err.code || 'Error', message: err.message })
    }
  }

  async getWithdrawStatus(req, res) {
    try {
      const orderNo = req.params.orderNo
      const user = await this.#validateCredentials(req)
      const transaction = await GatewayTransactionModel.findByExternalId(orderNo)
      if (!transaction) return res.status(404).json({ ok: false, error: 'TransactionNotFound' })
      return res.json({ ok: true, ...transaction.raw_pagandu })
    } catch (err) {
      return res.status(err.status || 500).json({ ok: false, error: err.code || 'Error', message: err.message })
    }
  }

  async ledger(req, res, next) {
    try {
      let userId = null
      const rawUserId = req.params.id || req.params.userId || req.user?.id
      
      if (rawUserId) {
        userId = Number(rawUserId)
      } else {
        const user = await this.#validateCredentials(req)
        userId = user.id
      }

      let wallet = await WalletModel.getUserWallet(userId, 'BRL')
      if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

      const entries = await LedgerModel.getWalletEntries(wallet.id)

      const enriched = await Promise.all(entries.map(async (e) => {
        const out = { ...e }
        let meta = out.meta || {}
        if (typeof meta === 'string') try { meta = JSON.parse(meta) } catch { meta = {} }

        let tradeNo = meta.tradeNo || meta.trade_no || null
        let document = meta.document || meta.payer_document || meta.payerCPF || meta.receiverDocument || null
        let name = meta.payer_name || meta.payerName || meta.receiverName || meta.name || null

        const newMeta = { ...meta }

        if (!tradeNo || !document || !name) {
          let tx = meta.merOrderNo ? await GatewayTransactionModel.findByMerOrderNo(meta.merOrderNo) : null
          if (!tx && tradeNo) tx = await GatewayTransactionModel.findByTradeNo(tradeNo)

          if (tx) {
            const raw = tx.raw_response
            if (raw) try { newMeta.raw_response = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { newMeta.raw_response = raw }
            
            if (!tradeNo) tradeNo = newMeta.raw_response?.tradeNo || newMeta.raw_response?.endToEndId || null
            if (!document) document = (GatewayTransactionModel.extractDocumentFromRaw(raw) || '').replace(/\D/g, '')
            if (!name) name = GatewayTransactionModel.extractNameFromRaw(raw)
          }
        }

        if (tradeNo) { newMeta.tradeNo = tradeNo; newMeta.e2e = tradeNo; }
        if (document) newMeta.document = document
        if (name) {
          if (e.direction === 'DEBIT') {
            newMeta.receiverName = name
            if (document) newMeta.receiverDocument = document
          } else {
            newMeta.payerName = name
            if (document) newMeta.payerDocument = document
          }
        }

        out.tradeNo = tradeNo
        out.document = document
        out.name = name
        out.merOrderNo = meta.merOrderNo || null
        out.externalId = e.external_id || null
        out.meta = newMeta

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

  async pixDeposit(req, res, next) {
    try {
      const user = await this.#validateCredentials(req)
      const { amount, payerName, payerCPF } = req.body

      if (!amount || amount <= 0) throw new HttpError(400, 'InvalidAmount')

      const merOrderNo = `user-${user.id}-${Date.now()}`
      const operatorToken = jwt.sign({ type: 'OPERATOR', sub: GATEWAY_OPERATOR_ID }, JWT_OPERATOR_SECRET, { expiresIn: '5m' })
      const externalId = req.body.external_id || req.body.externalId || `pagandu_${merOrderNo}-${crypto.randomUUID()}`

      const payload = {
        userId: user.id,
        amount: Number(amount),
        currency: 'BRL',
        payMethod: 'PIX',
        externalId: externalId,
        merOrderNo,
        providerCode: user.provider || "PAYZU",
        extra: { payerCPF: payerCPF || null, payerName: payerName || null }
      }

      const gatewayResp = await httpClient.post(`${GATEWAY_BASE_URL}/api/deposit`, payload, {
        headers: { Authorization: `Bearer ${operatorToken}`, 'Content-Type': 'application/json' }
      })

      const d = gatewayResp.data || {}
      const qrCodeUrl = d.qrCode || d.qrCodeString || d.params?.qrcode || d.raw?.qrcode || 'https://pagandu.com/pix/'

      // Enviar webhook imediato se houver URL no user
      // No microserviço, o user pode vir incompleto se validate-credentials não devolver tudo.
      // Precisamos garantir que devolve as URLs de webhook.
      if (user.webhook_url || user.webhook_url_pix_in) {
        sendWebhookToUser(user, 'DEPOSIT', { ...d.rawMutual, externalId, amount: Number(amount) }, 0, { useRawPayload: true })
      }

      return res.json({
        ok: true,
        status: 'waiting_payment',
        amount: Number(amount),
        externalId,
        merOrderNo,
        pix: { qrcode: qrCodeUrl, expirationDate: new Date(Date.now() + 20 * 60 * 1000).toISOString() }
      })
    } catch (err) {
      next(err)
    }
  }

  async pixWithdraw(req, res, next) {
    try {
      const user = await this.#validateCredentials(req)
      const { amount, key, keyType } = req.body
      
      if (!amount || amount <= 0) throw new HttpError(400, 'InvalidAmount')

      // Get fees from user-service
      const feeResp = await userService.get(`/internal/users/${user.id}/fees`)
      const fees = feeResp.data?.fees || {}

      const feeAmount = fees.pix_out_fee_type === 'FIXED' 
        ? Number(fees.pix_out_fee_value || 0) 
        : Number(((amount * (fees.pix_out_percent || 0)) / 100).toFixed(2))
      
      const totalAmount = amount + feeAmount

      const wallet = await WalletModel.getOrCreateUserWallet ? await WalletModel.getUserWallet(user.id, 'BRL') : await WalletModel.getUserWallet(user.id, 'BRL')
      if (!wallet || Number(wallet.balance) < totalAmount) throw new HttpError(400, 'InsufficientBalance')

      const merOrderNo = `withdraw-${user.id}-${Date.now()}`
      const externalId = req.body.externalId || `pagandu_${merOrderNo}-${crypto.randomUUID()}`
      const operatorToken = jwt.sign({ type: 'OPERATOR', sub: GATEWAY_OPERATOR_ID }, JWT_OPERATOR_SECRET, { expiresIn: '5m' })

      // Debit before
      await WalletModel.debit(wallet.id, {
        amount,
        description: `Saque Pix ${merOrderNo}`,
        meta: { merOrderNo, externalId, feeAmount, totalAmount, pixKey: key },
        externalId
      })
      
      if (feeAmount > 0) {
        await WalletModel.debit(wallet.id, {
          amount: feeAmount,
          description: `Taxa Saque Pix ${merOrderNo}`,
          meta: { parentExternalId: externalId, feeType: 'TRANSACTION_FEE' },
          externalId: `${externalId}-fee`
        })
      }

      const gatewayPayload = {
        orderId: merOrderNo,
        userId: user.id,
        amount: Number(amount),
        accountNumber: key,
        externalId: externalId,
        accountType: String(keyType).toUpperCase(),
        accountHolder: { name: user.name, document: user.document },
        providerCode: req.body.providerCode || 'GATEBOX'
      }

      try {
        await httpClient.post(`${GATEWAY_BASE_URL}/api/withdraw`, gatewayPayload, {
          headers: { Authorization: `Bearer ${operatorToken}` }
        })
        return res.json({ ok: true, status: 'completed', externalId, merOrderNo })
      } catch (err) {
        // Rollback
        await WalletModel.credit(wallet.id, { amount: totalAmount, description: `Estorno Saque ${merOrderNo}`, externalId: `${externalId}-REFUND` })
        throw err
      }
    } catch (err) {
      next(err)
    }
  }

  async mutate(req, res, next) {
    try {
      const { value, error } = mutateSchema.validate(req.body, { abortEarly: false })
      if (error) throw new HttpError(400, 'ValidationError', { details: error.details })

      const wallet = await WalletModel.getUserWallet(Number(req.params.id))
      if (!wallet) throw new HttpError(404, 'WalletNotFound')

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
}

export const walletController = new WalletController()