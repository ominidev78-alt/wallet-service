import { Router } from 'express'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { walletController } from '../controllers/WalletController.js'
import { WalletModel } from '../models/WalletModel.js'
import { LedgerModel } from '../models/LedgerModel.js'
import { WebhookLogModel } from '../models/WebhookLogModel.js'
import { env } from '../config/env.js'

const router = Router()

const GATEWAY_DEPOSIT_URL =
  env.GATEWAY_DEPOSIT_URL || 'https://payg2a.online/api/deposit'

const GATEWAY_WITHDRAW_URL =
  env.GATEWAY_WITHDRAW_URL || 'https://payg2a.online/api/withdraw'

const GATEWAY_REFUND_URL =
  env.GATEWAY_REFUND_URL || 'https://payg2a.online/api/payzu/refund'

const GATEWAY_OPERATOR_ID = Number(env.GATEWAY_OPERATOR_ID || 1)
const JWT_OPERATOR_SECRET = env.JWT_OPERATOR_SECRET || 'mutual-secret-2025'

/**
 * @openapi
 * tags:
 *   name: Wallets
 *   description: Operações de saldo, extrato, depósito Pix e saque Pix dos usuários.
 */

/**
 * @openapi
 * /api/users/{id}/wallet:
 *   get:
 *     summary: Consulta saldo da carteira BRL do usuário
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     responses:
 *       200:
 *         description: Saldo atual do usuário.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WalletBalanceResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/users/:id/wallet', (req, res, next) =>
  walletController.getBalance(req, res, next)
)

/**
 * @openapi
 * /api/users/{id}/wallet/credit:
 *   post:
 *     summary: Credita saldo manualmente na carteira BRL do usuário
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WalletMutationRequest'
 *     responses:
 *       200:
 *         description: Saldo atualizado após crédito.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/users/:id/wallet/credit', (req, res, next) =>
  walletController.credit(req, res, next)
)

/**
 * @openapi
 * /api/users/{id}/wallet/debit:
 *   post:
 *     summary: Debita saldo manualmente da carteira BRL do usuário
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WalletMutationRequest'
 *     responses:
 *       200:
 *         description: Saldo atualizado após débito.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/users/:id/wallet/debit', (req, res, next) =>
  walletController.debit(req, res, next)
)

/**
 * @openapi
 * /api/users/{id}/wallet/ledger:
 *   get:
 *     summary: Retorna o extrato (ledger) da carteira do usuário
 *     tags: [Wallets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     responses:
 *       200:
 *         description: Extrato completo da carteira.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WalletLedgerResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/users/:id/wallet/ledger', (req, res, next) =>
  walletController.ledger(req, res, next)
)


/**
 * @openapi
 * /api/wallet/deposit/pix:
 *   post:
 *     summary: Gera uma cobrança Pix (QR Code) para depósito na carteira BRL do usuário
 *     description: >
 *       Cria uma cobrança Pix via API Gateway (GATEWAY_DEPOSIT_URL) e retorna dados para exibição do QR Code.
 *     tags: [Wallets]
 *     parameters:
 *       - in: header
 *         name: app_id
 *         required: true
 *         schema:
 *           type: string
 *         description: App ID do cliente
 *       - in: header
 *         name: client_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID do cliente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Valor do depósito em BRL.
 *                 example: 100.0
 *               userId:
 *                 type: integer
 *                 description: ID do usuário no sistema.
 *                 example: 3
 *               payerName:
 *                 type: string
 *                 description: Nome do pagador.
 *               payerCPF:
 *                 type: string
 *                 description: CPF do pagador (apenas números).
 *             required:
 *               - amount
 *     responses:
 *       200:
 *         description: Cobrança Pix criada com sucesso.
 *       400:
 *         description: Erro de validação de payload.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/wallet/deposit/pix', async (req, res, next) => walletController.pixDeposit(req, res, next) /*{
  try {
    const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
    const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

    if (!appId) {
      return res.status(400).json({
        ok: false,
        error: 'MissingAppId',
        message: 'app_id é obrigatório nos headers.'
      })
    }

    if (!clientId) {
      return res.status(400).json({
        ok: false,
        error: 'MissingClientId',
        message: 'client_id é obrigatório nos headers.'
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

    const rawUserId =
      userId ??
      req.query.userId ??
      req.query.user_id

    if (!rawUserId) {
      return res.status(400).json({
        ok: false,
        error: 'MissingUserId',
        message: 'userId é obrigatório (body ou query ?userId=).'
      })
    }

    const finalUserId = Number(rawUserId)

    if (!Number.isFinite(finalUserId) || finalUserId <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'InvalidUserId',
        message: 'userId deve ser um número positivo.'
      })
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
      extra: {
        payerCPF: payerCPF || null,
        payerName: payerName || null
      }
    }

    console.log(
      '[PIX DEPOSIT USER-SERVICE] Enviando para GATEWAY_DEPOSIT_URL:',
      GATEWAY_DEPOSIT_URL,
      'payload:',
      JSON.stringify(payload)
    )

    const gatewayResponse = await axios.post(GATEWAY_DEPOSIT_URL, payload, {
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        'Content-Type': 'application/json'
      }
    })

    const d = gatewayResponse.data || {}

    const user = await UserModel.findById(finalUserId)
    
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
      'https://digital.mundipagg.com/pix/'

    const finalAmount = d.amount !== undefined ? d.amount : Number(amount)
    const spreadPercentage = 3
    const fixedAmount = 3
    const estimatedFee = Math.round((finalAmount * spreadPercentage / 100) + fixedAmount)
    const netAmount = finalAmount - estimatedFee

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
}*/)

/**
 * ------------------------------------------------------
 *            ROTA DE SAQUE PIX (PIX OUT)
 * ------------------------------------------------------
 */

/**
 * @openapi
 * /api/wallet/withdraw/pix:
 *   post:
 *     summary: Solicita um saque via Pix pelo API Gateway
 *     description: >
 *       Recebe os dados do saque (userId, amount, chave Pix, banco etc),
 *       gera um `orderId` (caso não seja enviado) e repassa a requisição
 *       para o API Gateway na rota `/api/withdraw`, que por sua vez integra
 *       com o provedor StarPago via `/api/v3/payout/create`.
 *
 *       O `operatorId` é enviado automaticamente com base em `GATEWAY_OPERATOR_ID`
 *       e um JWT de operador é gerado usando `JWT_OPERATOR_SECRET`.
 *     tags: [Wallets]
 *     parameters:
 *       - in: header
 *         name: app_id
 *         required: true
 *         schema:
 *           type: string
 *         description: App ID do cliente
 *       - in: header
 *         name: client_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID do cliente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - amount
 *               - key
 *               - keyType
 *               - bankCode
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 3
 *               amount:
 *                 type: number
 *                 example: 30.0
 *               key:
 *                 type: string
 *                 description: Chave Pix (CPF, e-mail, telefone ou aleatória)
 *                 example: "44775859806"
 *               keyType:
 *                 type: string
 *                 description: Tipo da chave Pix (CPF, EMAIL, PHONE, EVP)
 *                 example: "CPF"
 *               bankCode:
 *                 type: string
 *                 description: Código do banco (ISPB ou COMPE)
 *                 example: "237"
 *               holder:
 *                 type: object
 *                 description: Dados do titular da conta de destino
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "joao da silva"
 *                   document:
 *                     type: string
 *                     example: "44775859806"
 *               extra:
 *                 type: object
 *                 additionalProperties: true
 *                 example:
 *                   payerName: "joao da silvaa"
 *                   payerCPF: "44775859806"
 *               orderId:
 *                 type: string
 *                 description: Identificador único do saque. Se não enviado, será gerado automaticamente.
 *                 example: "withdraw-3-1732470000000"
 *     responses:
 *       200:
 *         description: Saque Pix criado com sucesso
 *       400:
 *         description: Erro de validação
 *       500:
 *         description: Erro interno ao criar o saque via gateway
 */

/**
 * ------------------------------------------------------
 *            ROTA DE REEMBOLSO (REFUND)
 * ------------------------------------------------------
 */

/**
 * @openapi
 * /api/wallet/refund:
 *   post:
 *     summary: Processa reembolso (refund) via API Gateway Payzu
 *     description: >
 *       Recebe os dados do reembolso e repassa a requisição
 *       para o API Gateway na rota `/api/payzu/refund`.
 *
 *       O `operatorId` é enviado automaticamente com base em `GATEWAY_OPERATOR_ID`
 *       e um JWT de operador é gerado usando `JWT_OPERATOR_SECRET`.
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - clientReference
 *             properties:
 *               id:
 *                 type: string
 *                 description: ID da transação a ser reembolsada
 *                 example: "tx_123456789"
 *               clientReference:
 *                 type: string
 *                 description: Referência do cliente
 *                 example: "user-3-1732470000000"
 *               endToEndId:
 *                 type: string
 *                 description: End-to-end ID da transação
 *                 example: "E12345678202401011234567890123456"
 *               description:
 *                 type: string
 *                 description: Descrição do reembolso
 *                 example: "Reembolso solicitado pelo usuário"
 *               callbackUrl:
 *                 type: string
 *                 format: uri
 *                 description: URL de callback para notificação do reembolso
 *                 example: "https://example.com/webhook/refund"
 *     responses:
 *       200:
 *         description: Reembolso processado com sucesso
 *       400:
 *         description: Erro de validação
 *       500:
 *         description: Erro interno ao processar o reembolso via gateway
 */
router.post('/wallet/refund', async (req, res, next) => walletController.pixRefund(req, res, next))

/**
 * ------------------------------------------------------
 *            ROTA DE WEBHOOK
 * ------------------------------------------------------
 */
router.post('/wallet/withdraw/pix', async (req, res, next) => walletController.pixWithdraw(req, res, next) /* {
  try {
    const appId = req.headers['app_id'] || req.headers['app-id'] || req.headers['App_id'] || req.headers['App-Id']
    const clientId = req.headers['client_id'] || req.headers['client-id'] || req.headers['Client_id'] || req.headers['Client-Id']

    if (!appId) {
      return res.status(400).json({ ok: false, error: 'MissingAppId', message: 'app_id é obrigatório nos headers.' })
    }

    if (!clientId) {
      return res.status(400).json({ ok: false, error: 'MissingClientId', message: 'client_id é obrigatório nos headers.' })
    }

    const {
      userId,
      user_id,
      amount,
      key,
      keyType,
      bankCode,
      holder,
      extra,
      orderId,
      code,
      recoveryCode
    } = req.body || {}

    const finalUserId = Number(userId ?? user_id)

    if (!finalUserId || !Number.isFinite(finalUserId) || finalUserId <= 0) {
      return res.status(400).json({ ok: false, error: 'InvalidUserId', message: 'userId deve ser um número positivo.' })
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ ok: false, error: 'InvalidAmount', message: 'amount deve ser maior que zero.' })
    }

    if (!key || !keyType || !bankCode) {
      return res.status(400).json({
        ok: false,
        error: 'MissingPixData',
        message: 'key, keyType e bankCode são obrigatórios.'
      })
    }

    // Check if 2FA is enabled and verify code
    const twoFactorConfig = await TwoFactorAuthModel.findByUserId(finalUserId)
    const twoFactorEnabled = twoFactorConfig?.enabled || false

    if (twoFactorEnabled) {
      // 2FA is required for OUT transactions
      if (!code && !recoveryCode) {
        return res.status(200).json({
          ok: false,
          requires2FA: true,
          message: 'Código 2FA é obrigatório para realizar saques'
        })
      }

      // Check if locked
      const isLocked = await TwoFactorAuthModel.isLocked(finalUserId)
      if (isLocked) {
        return res.status(423).json({
          ok: false,
          error: 'TwoFactorLocked',
          message: '2FA está temporariamente bloqueado devido a múltiplas tentativas falhas'
        })
      }

      let isValid = false

      if (recoveryCode) {
        isValid = await TwoFactorAuthModel.verifyRecoveryCode(finalUserId, recoveryCode)
      } else if (code) {
        isValid = TotpService.verifyToken(code, twoFactorConfig.secret)
      }

      if (!isValid) {
        const failure = await TwoFactorAuthModel.recordFailure(finalUserId)
        
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || null
        const userAgent = req.headers['user-agent'] || null

        await TwoFactorAuthModel.addAuditLog({
          userId: finalUserId,
          action: 'PIX_WITHDRAW_2FA_FAILED',
          method: 'TOTP',
          context: JSON.stringify({ amount: Number(amount), keyType }),
          ipAddress,
          userAgent,
          success: false,
          failureReason: 'Invalid code'
        })

        if (failure.locked) {
          return res.status(423).json({
            ok: false,
            error: 'TwoFactorLocked',
            message: 'Muitas tentativas falhas. 2FA bloqueado temporariamente.'
          })
        }

        return res.status(400).json({
          ok: false,
          error: 'InvalidCode',
          message: 'Código 2FA inválido',
          attemptsRemaining: 3 - failure.attempts
        })
      }

      // Record successful 2FA verification
      await TwoFactorAuthModel.recordSuccess(finalUserId)

      const ipAddress = req.ip || req.headers['x-forwarded-for'] || null
      const userAgent = req.headers['user-agent'] || null

      await TwoFactorAuthModel.addAuditLog({
        userId: finalUserId,
        action: 'PIX_WITHDRAW_2FA_SUCCESS',
        method: 'TOTP',
        context: JSON.stringify({ amount: Number(amount), keyType }),
        ipAddress,
        userAgent,
        success: true
      })
    }

    if (!JWT_OPERATOR_SECRET) {
      return res.status(500).json({
        ok: false,
        error: 'MissingOperatorSecret',
        message: 'JWT_OPERATOR_SECRET não configurado.'
      })
    }

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

    console.log('[PIX WITHDRAW USER-SERVICE] === INÍCIO ===', {
      userId: finalUserId,
      amount: Number(amount),
      keyType,
      mappedType: typeMap[keyType] || 'EVP',
      timestamp: new Date().toISOString()
    })

    const mappedType = typeMap[keyType] || 'EVP'

    const payerName =
      (extra?.payerName && String(extra.payerName).trim()) ||
      (holder?.name && String(holder.name).trim()) ||
      'Cliente Mutual'

    const payerCPF =
      (extra?.payerCPF && String(extra.payerCPF).replace(/\D/g, '')) ||
      (holder?.document && String(holder.document).replace(/\D/g, '')) ||
      '00000000000'

    const operatorToken = jwt.sign(
      { type: 'OPERATOR', sub: GATEWAY_OPERATOR_ID },
      JWT_OPERATOR_SECRET,
      { expiresIn: '5m' }
    )

    const finalOrderId = orderId || `withdraw-${finalUserId}-${Date.now()}`

    const gatewayPayload = {
      operatorId: GATEWAY_OPERATOR_ID,
      userId: finalUserId,
      orderId: finalOrderId,
      amount: Number(amount),
      currency: 'BRL',
      bankCode: String(bankCode),
      accountNumber: key,
      accountType: mappedType,
      accountHolder: {
        name: payerName,
        document: payerCPF
      },
      payMethod: 'PIX',
      extra: {
        ...(extra || {}),
        userId: finalUserId
      }
    }

    console.log('[PIX WITHDRAW USER-SERVICE] → Gateway URL:', GATEWAY_WITHDRAW_URL)
    console.log('[PIX WITHDRAW USER-SERVICE] → Gateway payload:', JSON.stringify(gatewayPayload, null, 2))

    try {
      const r = await axios.post(GATEWAY_WITHDRAW_URL, gatewayPayload, {
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('[PIX WITHDRAW USER-SERVICE] ✅ Resposta do gateway:', {
        status: r.status,
        data: r.data,
        orderId: finalOrderId
      })

      return res.status(200).json(r.data)
    } catch (gatewayError) {
      console.error('[PIX WITHDRAW USER-SERVICE] ❌ Erro ao chamar gateway:', {
        message: gatewayError.message,
        response: gatewayError.response?.data,
        status: gatewayError.response?.status
      })
      throw gatewayError
    }
  } catch (err) {
    if (err.response) {
      console.error('[PIX WITHDRAW USER-SERVICE][GATEWAY ERROR]', err.response.status, err.response.data)
    } else {
      console.error('[PIX WITHDRAW USER-SERVICE][ERROR]', err)
    }

    return res.status(500).json({
      ok: false,
      error: 'PixWithdrawFailed',
      message: 'Falha ao processar saque Pix pelo user-service.'
    })
  }
}*/)

/**
 * Função auxiliar para enviar webhook ao usuário
 * Usa webhook_url_pix_in ou webhook_url_pix_out se disponível, caso contrário usa webhook_url
 */
async function sendWebhookToUser(user, transactionType, payload) {
  let targetUrl = null
  
  // Determinar URL baseada no tipo de transação
  if (transactionType === 'DEPOSIT' || transactionType === 'PIX_IN') {
    targetUrl = user.webhook_url_pix_in || user.webhook_url || null
  } else if (transactionType === 'WITHDRAW' || transactionType === 'PIX_OUT') {
    targetUrl = user.webhook_url_pix_out || user.webhook_url || null
  } else {
    // Fallback para webhook_url genérico
    targetUrl = user.webhook_url || null
  }

  if (!targetUrl) {
    console.log('[sendWebhookToUser] Nenhuma URL de webhook configurada para o usuário:', user.id)
    return null
  }

  const start = Date.now()
  try {
    const response = await axios.post(targetUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000 // 10 segundos de timeout
    })
    const latency = Date.now() - start

    // Registrar no log
    await WebhookLogModel.insert({
      event_type: transactionType === 'DEPOSIT' ? 'PIX_DEPOSIT_WEBHOOK' : 'PIX_WITHDRAW_WEBHOOK',
      transaction_id: payload.orderNo || payload.tradeNo || payload.merOrderNo || null,
      target_url: targetUrl,
      http_status: response.status,
      latency_ms: latency,
      status: response.status >= 200 && response.status < 300 ? 'delivered' : 'failed',
      payload: payload,
      response_body: JSON.stringify(response.data || null),
      error: null
    })

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

    // Registrar no log
    await WebhookLogModel.insert({
      event_type: transactionType === 'DEPOSIT' ? 'PIX_DEPOSIT_WEBHOOK' : 'PIX_WITHDRAW_WEBHOOK',
      transaction_id: payload.orderNo || payload.tradeNo || payload.merOrderNo || null,
      target_url: targetUrl,
      http_status: status,
      latency_ms: latency,
      status: 'failed',
      payload: payload,
      response_body: responseBody,
      error: error.message || 'Request failed'
    })

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

/**
 * @openapi
 * /api/wallet/webhook:
 *   post:
 *     summary: Recebe notificações de webhook para pagamentos PIX
 *     description: >
 *       Endpoint para receber notificações de webhook do gateway de pagamentos.
 *       Processa callbacks de depósitos e saques PIX, atualizando o saldo da carteira do usuário.
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               merOrderNo:
 *                 type: string
 *                 description: Número do pedido do merchant
 *               orderNo:
 *                 type: string
 *                 description: Número do pedido do gateway
 *               status:
 *                 type: string
 *                 description: Status do pagamento (SUCCESS, FAILED, PENDING, etc)
 *               amount:
 *                 type: number
 *                 description: Valor da transação
 *               userId:
 *                 type: integer
 *                 description: ID do usuário
 *               type:
 *                 type: string
 *                 description: Tipo de transação (DEPOSIT, WITHDRAW)
 *     responses:
 *       200:
 *         description: Webhook processado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *       400:
 *         description: Payload inválido
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/wallet/webhook', async (req, res, next) => {
  console.log('[WEBHOOK] === INÍCIO ===', {
    body: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    },
    timestamp: new Date().toISOString()
  })

  try {
    const { merOrderNo, orderNo, tradeNo, status, amount, userId, type } = req.body || {}

    console.log('[WEBHOOK] Dados extraídos do body:', {
      merOrderNo,
      orderNo,
      tradeNo,
      status,
      amount,
      userId,
      type,
      timestamp: new Date().toISOString()
    })

    if (!merOrderNo || (!orderNo && !tradeNo)) {
      return res.status(400).json({
        ok: false,
        error: 'InvalidWebhookPayload',
        message: 'merOrderNo e pelo menos um de orderNo/tradeNo são obrigatórios.'
      })
    }

    if (!userId) {
      console.log('[WEBHOOK] Ignorado - userId não fornecido')
      return res.json({ ok: true, ignored: true, reason: 'No userId' })
    }

    const finalUserId = Number(userId)
    if (!Number.isFinite(finalUserId) || finalUserId <= 0) {
      console.log('[WEBHOOK] Ignorado - userId inválido:', userId)
      return res.json({ ok: true, ignored: true, reason: 'Invalid userId' })
    }

    const user = await UserModel.findById(finalUserId)
    if (!user) {
      console.log('[WEBHOOK] Ignorado - usuário não encontrado:', finalUserId)
      return res.json({ ok: true, ignored: true, reason: 'User not found' })
    }

    let wallet = await WalletModel.getUserWallet(finalUserId, 'BRL')
    if (!wallet) {
      wallet = await WalletModel.createUserWallet(finalUserId, 'BRL')
    }

    // Detectar tipo de transação: verificar type, orderId, ou outros campos
    let detectedType = (type || '').toUpperCase()
    
    // Se não tiver type, tentar detectar pelo orderId ou outros campos
    if (!detectedType || detectedType === 'DEPOSIT') {
      const orderId = req.body.orderId || merOrderNo || orderNo || ''
      if (String(orderId).toLowerCase().includes('withdraw') || 
          String(orderId).toLowerCase().startsWith('withdraw-')) {
        detectedType = 'WITHDRAW'
        console.log('[WEBHOOK] Tipo detectado como WITHDRAW pelo orderId:', orderId)
      }
    }
    
    // Verificar se há indicação de saque no payload
    if (!detectedType || detectedType === 'DEPOSIT') {
      const payMethod = (req.body.payMethod || req.body.pay_method || '').toUpperCase()
      const transactionType = (req.body.transactionType || req.body.transaction_type || '').toUpperCase()
      if (transactionType === 'WITHDRAW' || transactionType === 'PIX_WITHDRAW') {
        detectedType = 'WITHDRAW'
        console.log('[WEBHOOK] Tipo detectado como WITHDRAW pelo transactionType:', transactionType)
      }
    }
    
    const transactionType = detectedType || 'DEPOSIT'
    const transactionStatus = String(status || '').toUpperCase()

    console.log('[WEBHOOK] Tipo e status da transação:', {
      transactionType,
      transactionStatus,
      typeOriginal: type,
      statusOriginal: status,
      amount,
      merOrderNo,
      orderNo,
      tradeNo,
      orderId: req.body.orderId,
      payMethod: req.body.payMethod,
      fullBody: JSON.stringify(req.body, null, 2)
    })

    if (transactionType === 'DEPOSIT' && (transactionStatus === 'SUCCESS' || transactionStatus === 'PAID')) {
      const originalAmount = Number(amount) || 0

      // Validação adicional: garantir que há um tradeNo ou orderNo válido (indica pagamento confirmado)
      if (!tradeNo && !orderNo) {
        console.log('[WEBHOOK] ⚠️ Depósito com status SUCCESS mas sem tradeNo/orderNo, ignorando:', {
          merOrderNo,
          status: transactionStatus,
          note: 'Pagamento pode não ter sido realmente confirmado'
        })
        return res.json({ ok: true, ignored: true, reason: 'Missing tradeNo/orderNo' })
      }

      // Verificar se a transação já foi processada ANTES de processar
      const alreadyProcessed = await LedgerModel.isTransactionProcessed(wallet.id, merOrderNo, orderNo, tradeNo)
      if (alreadyProcessed) {
        console.log('[WEBHOOK] ⚠️ Depósito já processado, ignorando:', {
          merOrderNo,
          orderNo,
          tradeNo,
          walletId: wallet.id,
          transactionType,
          transactionStatus
        })
        return res.json({ ok: true, ignored: true, reason: 'Already processed' })
      }

      console.log('[WEBHOOK] === PROCESSANDO DEPOSIT ===', {
        userId: finalUserId,
        originalAmount,
        orderNo,
        tradeNo,
        merOrderNo,
        status: transactionStatus,
        walletId: wallet.id,
        currentBalance: wallet.balance,
        timestamp: new Date().toISOString()
      })

      if (originalAmount > 0) {
        // Calcular taxa
        console.log('[WEBHOOK] Calculando taxa de PIX IN...')
        const { netAmount, feeAmount, totalAmount } = await walletController.calculatePixInFee(finalUserId, originalAmount)
        console.log('[WEBHOOK] Taxa calculada:', {
          originalAmount,
          totalAmount,
          feeAmount,
          netAmount
        })

        // Criar duas transações simultâneas:
        // 1. Crédito na wallet do usuário (valor líquido = original - taxa)
        // 2. Crédito na wallet da tesouraria (valor da taxa)
        
        console.log('[WEBHOOK] Criando transações simultâneas...')
        
        // Transação 1: Crédito na wallet do usuário
        console.log('[WEBHOOK] Transação 1: Creditando valor líquido na wallet do usuário:', {
          walletId: wallet.id,
          amount: netAmount,
          originalAmount: totalAmount,
          feeAmount
        })
        
        try {
          // Gerar external_id se não foi fornecido no webhook
          const externalId = req.body.external_id || req.body.externalId || `mutual_${merOrderNo || orderNo || tradeNo || Date.now()}-${crypto.randomUUID()}`
          
          await WalletModel.credit(wallet.id, {
            amount: netAmount,
            description: tradeNo ? `PIX DEPOSIT ${tradeNo}` : `PIX DEPOSIT ${orderNo}`,
            meta: {
              merOrderNo,
              orderNo,
              tradeNo: tradeNo,
              e2e: tradeNo,
              status,
              provider: 'GATEWAY',
              type: 'PIX_DEPOSIT',
              webhookReceivedAt: new Date().toISOString(),
              originalAmount: totalAmount, // Valor total depositado
              feeAmount, // Taxa calculada
              netAmount, // Valor líquido creditado (original - taxa)
              totalAmount: totalAmount, // Valor total da transação
              finalAmount: netAmount // Valor final creditado
            },
            externalId
          })
          console.log('[WEBHOOK] ✅ Transação 1: Valor líquido creditado na wallet do usuário com sucesso')
        } catch (creditError) {
          console.error('[WEBHOOK] ❌ Erro ao creditar valor líquido:', {
            error: creditError.message,
            stack: creditError.stack,
            walletId: wallet.id,
            amount: netAmount
          })
          throw creditError
        }

        // Transação 2: Crédito na wallet da tesouraria (se houver taxa)
        if (feeAmount > 0) {
          console.log('[WEBHOOK] Transação 2: Creditando taxa na wallet da tesouraria:', {
            feeAmount,
            originalAmount: totalAmount
          })
          
          try {
            const houseWallet = await walletController.getHouseWallet('BRL')
            if (houseWallet) {
              // Gerar external_id para a taxa baseado no external_id principal
              const feeExternalId = `${externalId}-fee-pix-in`
              
              await WalletModel.credit(houseWallet.id, {
                amount: feeAmount,
                description: `Taxa de transação - PIX IN - Usuário ${finalUserId}`,
                meta: {
                  userId: finalUserId,
                  transactionType: 'PIX_IN_FEE',
                  feeType: 'TRANSACTION_FEE',
                  originalAmount: totalAmount, // Valor total depositado
                  feeAmount, // Taxa creditada
                  relatedTransaction: 'PIX_DEPOSIT',
                  merOrderNo,
                  orderNo,
                  tradeNo,
                  webhookReceivedAt: new Date().toISOString()
                },
                externalId: feeExternalId
              })
              console.log('[WEBHOOK] ✅ Transação 2: Taxa creditada na tesouraria com sucesso')
            } else {
              console.error('[WEBHOOK] ❌ Wallet da tesouraria não encontrada!')
            }
          } catch (treasuryError) {
            console.error('[WEBHOOK] ❌ Erro ao creditar taxa na tesouraria:', {
              error: treasuryError.message,
              stack: treasuryError.stack
            })
            throw treasuryError
          }
        } else {
          console.log('[WEBHOOK] ℹ️ Nenhuma taxa a ser creditada na tesouraria (feeAmount = 0)')
        }

        console.log('[WEBHOOK] ✅ Depósito processado com sucesso - Duas transações criadas:', {
          userId: finalUserId,
          originalAmount: totalAmount,
          feeAmount,
          netAmount,
          orderNo,
          tradeNo
        })

        // Enviar webhook ao usuário
        const webhookPayload = {
          merOrderNo,
          orderNo,
          tradeNo,
          status: transactionStatus,
          amount: totalAmount,
          netAmount,
          feeAmount,
          userId: finalUserId,
          type: 'DEPOSIT'
        }
        await sendWebhookToUser(user, 'DEPOSIT', webhookPayload)
      } else {
        console.log('[WEBHOOK] ⚠️ Valor do depósito inválido ou zero:', originalAmount)
      }
    }

    // Para WITHDRAW: Debitar valor principal e aplicar taxa quando a transação for confirmada pelo gateway
    console.log('[WEBHOOK] Verificando se é WITHDRAW:', {
      transactionType,
      transactionStatus,
      isWithdraw: transactionType === 'WITHDRAW',
      isSuccess: transactionStatus === 'SUCCESS' || transactionStatus === 'PAID',
      willProcess: transactionType === 'WITHDRAW' && (transactionStatus === 'SUCCESS' || transactionStatus === 'PAID')
    })
    
    // Log para WITHDRAW com status diferente de SUCCESS/PAID
    if (transactionType === 'WITHDRAW' && transactionStatus !== 'SUCCESS' && transactionStatus !== 'PAID') {
      console.log('[WEBHOOK] ⚠️ WITHDRAW recebido mas status não é SUCCESS/PAID:', {
        transactionType,
        transactionStatus,
        merOrderNo,
        orderNo,
        tradeNo,
        amount,
        userId: finalUserId,
        note: 'O débito será processado quando o status mudar para SUCCESS ou PAID'
      })
    }
    
    if (transactionType === 'WITHDRAW' && (transactionStatus === 'SUCCESS' || transactionStatus === 'PAID')) {
      const withdrawAmount = Number(amount) || 0
      
      // Verificar se a transação já foi processada ANTES de processar
      const alreadyProcessed = await LedgerModel.isTransactionProcessed(wallet.id, merOrderNo, orderNo, tradeNo)
      if (alreadyProcessed) {
        console.log('[WEBHOOK] ⚠️ Saque já processado, ignorando:', {
          merOrderNo,
          orderNo,
          tradeNo,
          walletId: wallet.id,
          transactionType,
          transactionStatus
        })
        return res.json({ ok: true, ignored: true, reason: 'Already processed' })
      }
      
      console.log('[WEBHOOK] === PROCESSANDO WITHDRAW ===', {
        userId: finalUserId,
        withdrawAmount,
        orderNo,
        tradeNo,
        merOrderNo,
        status: transactionStatus,
        walletId: wallet.id,
        currentBalance: wallet.balance,
        timestamp: new Date().toISOString()
      })
      
      if (withdrawAmount > 0) {
        // Calcular taxa
        console.log('[WEBHOOK] Calculando taxa de PIX OUT...')
        const { totalAmount, feeAmount, netAmount } = await walletController.calculatePixOutFee(finalUserId, withdrawAmount)
        console.log('[WEBHOOK] Taxa calculada:', {
          originalAmount: withdrawAmount,
          totalAmount,
          feeAmount,
          netAmount
        })

        // Criar três transações simultâneas:
        // 1. Débito na wallet do usuário (valor líquido = original)
        // 2. Débito na wallet do usuário (taxa)
        // 3. Crédito na wallet da tesouraria (valor da taxa)
        
        console.log('[WEBHOOK] Criando transações simultâneas...')
        
        // Gerar external_id se não foi fornecido no webhook (definir antes dos blocos try para estar disponível em todo o escopo)
        const withdrawExternalId = req.body.external_id || req.body.externalId || `mutual_${merOrderNo || orderNo || tradeNo || Date.now()}-${crypto.randomUUID()}`
        
        // Transação 1: Débito do valor líquido na wallet do usuário
        console.log('[WEBHOOK] Transação 1: Debitando valor líquido da wallet do usuário:', {
          walletId: wallet.id,
          amount: netAmount,
          originalAmount: withdrawAmount,
          feeAmount,
          currentBalance: wallet.balance
        })
        
        try {
          await WalletModel.debit(wallet.id, {
            amount: netAmount, // Valor líquido (sem taxa)
            description: tradeNo ? `PIX WITHDRAW ${tradeNo}` : `PIX WITHDRAW ${orderNo}`,
            meta: {
              merOrderNo,
              orderNo,
              tradeNo: tradeNo,
              e2e: tradeNo,
              status: transactionStatus,
              provider: 'GATEWAY',
              type: 'PIX_WITHDRAW',
              webhookReceivedAt: new Date().toISOString(),
              originalAmount: withdrawAmount, // Valor original a sacar
              feeAmount, // Taxa calculada
              netAmount, // Valor que será enviado (original)
              totalAmount, // Valor total debitado (original + taxa)
              finalAmount: netAmount // Valor final enviado
            },
            externalId: withdrawExternalId
          })
          console.log('[WEBHOOK] ✅ Transação 1: Valor líquido debitado da wallet do usuário com sucesso')
        } catch (debitError) {
          console.error('[WEBHOOK] ❌ Erro ao debitar valor líquido do saque:', {
            error: debitError.message,
            stack: debitError.stack,
            walletId: wallet.id,
            amount: netAmount
          })
          throw debitError
        }

        // Transação 2: Débito da taxa na wallet do usuário (se houver)
        if (feeAmount > 0) {
          console.log('[WEBHOOK] Transação 2: Debitando taxa da wallet do usuário:', {
            walletId: wallet.id,
            amount: feeAmount,
            originalAmount: withdrawAmount
          })
          
          try {
            // Gerar external_id para a taxa baseado no external_id principal
            const feeExternalId = `${withdrawExternalId}-fee-pix-out`
            
            await WalletModel.debit(wallet.id, {
              amount: feeAmount, // Taxa debitada
              description: `Taxa de transação - PIX OUT - ${tradeNo ? tradeNo : orderNo}`,
              meta: {
                merOrderNo,
                orderNo,
                tradeNo: tradeNo,
                e2e: tradeNo,
                status: transactionStatus,
                provider: 'GATEWAY',
                type: 'PIX_WITHDRAW',
                transactionType: 'PIX_OUT_FEE',
                feeType: 'TRANSACTION_FEE',
                webhookReceivedAt: new Date().toISOString(),
                originalAmount: withdrawAmount, // Valor original a sacar
                feeAmount, // Taxa debitada
                netAmount, // Valor que será enviado (original)
                totalAmount, // Valor total debitado (original + taxa)
                relatedTransaction: 'PIX_WITHDRAW'
              },
              externalId: feeExternalId
            })
            console.log('[WEBHOOK] ✅ Transação 2: Taxa debitada da wallet do usuário com sucesso')
          } catch (feeDebitError) {
            console.error('[WEBHOOK] ❌ Erro ao debitar taxa do saque:', {
              error: feeDebitError.message,
              stack: feeDebitError.stack,
              walletId: wallet.id,
              amount: feeAmount
            })
            throw feeDebitError
          }
        }

        // Transação 3: Crédito na wallet da tesouraria (se houver taxa)
        if (feeAmount > 0) {
          console.log('[WEBHOOK] Transação 3: Creditando taxa na wallet da tesouraria:', {
            feeAmount,
            originalAmount: withdrawAmount
          })
          
          try {
            console.log('[WEBHOOK] Buscando wallet da tesouraria...')
            const houseWallet = await walletController.getHouseWallet('BRL')
            console.log('[WEBHOOK] Wallet da tesouraria obtida:', {
              walletId: houseWallet?.id,
              userId: houseWallet?.user_id,
              type: houseWallet?.type,
              balance: houseWallet?.balance
            })
            
            if (houseWallet) {
              // Buscar taxas para salvar no meta
              const fees = await UserFeeModel.getByUserId(finalUserId)
              
              console.log('[WEBHOOK] Creditando taxa na tesouraria:', {
                houseWalletId: houseWallet.id,
                feeAmount,
                description: `Taxa de transação - PIX OUT - Usuário ${finalUserId}`
              })
              
              // Gerar external_id para a taxa da tesouraria
              const treasuryFeeExternalId = `${withdrawExternalId}-fee-treasury-pix-out`
              
              await WalletModel.credit(houseWallet.id, {
                amount: feeAmount,
                description: `Taxa de transação - PIX OUT - Usuário ${finalUserId}`,
                meta: {
                  userId: finalUserId,
                  transactionType: 'PIX_OUT_FEE',
                  feeType: 'TRANSACTION_FEE',
                  originalAmount: withdrawAmount, // Valor original do saque
                  feeAmount, // Taxa creditada
                  relatedTransaction: 'PIX_WITHDRAW',
                  merOrderNo,
                  orderNo,
                  tradeNo,
                  feeTypeConfig: fees?.pix_out_fee_type || 'PERCENT',
                  feeValue: fees?.pix_out_fee_type === 'FIXED' ? fees?.pix_out_fee_value : fees?.pix_out_percent,
                  webhookReceivedAt: new Date().toISOString()
                },
                externalId: treasuryFeeExternalId
              })
              console.log('[WEBHOOK] ✅ Transação 3: Taxa creditada na tesouraria com sucesso')
            } else {
              console.error('[WEBHOOK] ❌ Wallet da tesouraria não encontrada!')
              throw new Error('Wallet da tesouraria não encontrada')
            }
          } catch (treasuryError) {
            console.error('[WEBHOOK] ❌ Erro ao creditar taxa na tesouraria:', {
              error: treasuryError.message,
              stack: treasuryError.stack,
              feeAmount,
              userId: finalUserId
            })
            // Não lançar erro para não bloquear o débito do usuário
            // Mas logar o erro para debug
          }
        } else {
          console.log('[WEBHOOK] ⚠️ Nenhuma taxa a ser creditada na tesouraria (feeAmount = 0)')
          console.log('[WEBHOOK] ⚠️ Verifique se o usuário tem taxas configuradas!')
        }

        console.log('[WEBHOOK] ✅ Saque processado com sucesso:', {
          userId: finalUserId,
          originalAmount: withdrawAmount,
          feeAmount,
          totalAmount,
          netAmount,
          orderNo,
          tradeNo,
          transacoesCriadas: feeAmount > 0 ? '3 (valor líquido + taxa usuário + taxa tesouraria)' : '1 (apenas valor líquido)'
        })

        // Enviar webhook ao usuário
        const webhookPayload = {
          merOrderNo,
          orderNo,
          tradeNo,
          status: transactionStatus,
          amount: withdrawAmount,
          netAmount,
          feeAmount,
          totalAmount,
          userId: finalUserId,
          type: 'WITHDRAW'
        }
        await sendWebhookToUser(user, 'WITHDRAW', webhookPayload)
      } else {
        console.log('[WEBHOOK] ⚠️ Valor do saque inválido ou zero:', withdrawAmount)
      }
    } else {
      console.log('[WEBHOOK] ⚠️ Transação não é WITHDRAW ou status não é SUCCESS/PAID:', {
        transactionType,
        transactionStatus,
        amount
      })
    }
    
    console.log('[WEBHOOK] === FIM DO PROCESSAMENTO ===')
    return res.json({ ok: true })
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err)
    
    if (err.response) {
      console.error('[WEBHOOK][GATEWAY ERROR]', err.response.status, err.response.data)
    }

    return res.status(500).json({
      ok: false,
      error: 'WebhookProcessingFailed',
      message: 'Falha ao processar webhook.'
    })
  }
})

/**
 * StarPago-specific webhook to persist tradeNo. Accepts payloads like:
 * {
 *   merOrderNo, orderNo, tradeNo, status, amount, userId, payMethod, type
 * }
 */
router.post('/wallet/webhook/starpago', async (req, res) => {
  console.log('[WEBHOOK STARPAGO] === INÍCIO ===', {
    body: req.body,
    timestamp: new Date().toISOString()
  })

  try {
    const body = req.body || {}
    const merOrderNo = body.merOrderNo || body.mer_order_no
    const orderNo = body.orderNo || body.order_no || body.providerOrderNo
    const tradeNo = body.tradeNo || body.trade_no
    const status = String(body.status || '').toUpperCase()
    const amount = Number(body.amount || body.paidAmount || 0)
    const userId = Number(body.userId || body.user_id)
    const isDeposit = String(body.payMethod || '').toUpperCase() === 'PIX' && amount > 0 && (body.type || '').toUpperCase() !== 'WITHDRAW'
    const isWithdraw = (body.type || '').toUpperCase() === 'WITHDRAW' || String(body.description || '').toUpperCase().includes('WITHDRAW')

    console.log('[WEBHOOK STARPAGO] Dados extraídos:', {
      merOrderNo,
      orderNo,
      tradeNo,
      status,
      amount,
      userId,
      isDeposit,
      isWithdraw
    })

    if (!userId || userId <= 0) {
      console.log('[WEBHOOK STARPAGO] Ignorado - userId inválido')
      return res.json({ ok: true, ignored: true, reason: 'Invalid userId' })
    }
    
    const user = await UserModel.findById(userId)
    if (!user) {
      console.log('[WEBHOOK STARPAGO] Ignorado - usuário não encontrado')
      return res.json({ ok: true, ignored: true, reason: 'User not found' })
    }

    let wallet = await WalletModel.getUserWallet(userId, 'BRL')
    if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

    if ((status === 'SUCCESS' || status === 'PAID') && amount > 0) {
      // Verificar se a transação já foi processada ANTES de processar
      const alreadyProcessed = await LedgerModel.isTransactionProcessed(wallet.id, merOrderNo, orderNo, tradeNo)
      if (alreadyProcessed) {
        console.log('[WEBHOOK STARPAGO] ⚠️ Transação já processada, ignorando:', {
          merOrderNo,
          orderNo,
          tradeNo,
          walletId: wallet.id,
          isDeposit,
          isWithdraw
        })
        return res.json({ ok: true, ignored: true, reason: 'Already processed' })
      }
      if (isDeposit) {
        console.log('[WEBHOOK STARPAGO] === PROCESSANDO DEPOSIT ===', {
          userId,
          originalAmount: amount,
          orderNo,
          tradeNo,
          merOrderNo
        })

        // Calcular taxa
        const { netAmount, feeAmount, totalAmount } = await walletController.calculatePixInFee(userId, amount)
        console.log('[WEBHOOK STARPAGO] Taxa calculada para depósito:', {
          originalAmount: amount,
          totalAmount,
          feeAmount,
          netAmount
        })

        // Gerar external_id se não foi fornecido no webhook
        const starpagoDepositExternalId = body.external_id || body.externalId || `mutual_${merOrderNo || orderNo || tradeNo || Date.now()}-${crypto.randomUUID()}`
        
        // Transação 1: Crédito na wallet do usuário (valor líquido)
        console.log('[WEBHOOK STARPAGO] Transação 1: Creditando valor líquido na wallet do usuário:', {
          walletId: wallet.id,
          amount: netAmount
        })
        
        await WalletModel.credit(wallet.id, {
          amount: netAmount,
          description: tradeNo ? `PIX DEPOSIT ${tradeNo}` : `PIX DEPOSIT ${orderNo}`,
          meta: {
            source: 'WEBHOOK_STARPAGO_DEPOSIT',
            provider: 'STARPAGO',
            merOrderNo,
            orderNo,
            tradeNo: tradeNo || undefined,
            e2e: tradeNo || undefined,
            status,
            type: 'PIX_DEPOSIT',
            webhookReceivedAt: new Date().toISOString(),
            originalAmount: totalAmount,
            feeAmount,
            netAmount,
            totalAmount: totalAmount,
            finalAmount: netAmount,
            raw_response: (() => { try { return JSON.stringify(body) } catch { return undefined } })()
          },
          externalId: starpagoDepositExternalId
        })
        console.log('[WEBHOOK STARPAGO] ✅ Transação 1: Valor líquido creditado na wallet do usuário')

        // Transação 2: Crédito na wallet da tesouraria (se houver taxa)
        if (feeAmount > 0) {
          console.log('[WEBHOOK STARPAGO] Transação 2: Creditando taxa na tesouraria:', {
            feeAmount
          })
          
          const houseWallet = await walletController.getHouseWallet('BRL')
          if (houseWallet) {
            // Gerar external_id para a taxa baseado no external_id principal
            const starpagoFeeExternalId = `${starpagoDepositExternalId}-fee-pix-in`
            
            await WalletModel.credit(houseWallet.id, {
              amount: feeAmount,
              description: `Taxa de transação - PIX IN - Usuário ${userId}`,
              meta: {
                userId,
                transactionType: 'PIX_IN_FEE',
                feeType: 'TRANSACTION_FEE',
                originalAmount: totalAmount,
                feeAmount,
                relatedTransaction: 'PIX_DEPOSIT',
                merOrderNo,
                orderNo,
                tradeNo,
                provider: 'STARPAGO',
                source: 'WEBHOOK_STARPAGO_DEPOSIT',
                webhookReceivedAt: new Date().toISOString()
              },
              externalId: starpagoFeeExternalId
            })
            console.log('[WEBHOOK STARPAGO] ✅ Transação 2: Taxa creditada na tesouraria')
          } else {
            console.error('[WEBHOOK STARPAGO] ❌ Wallet da tesouraria não encontrada!')
          }
        }

        console.log('[WEBHOOK STARPAGO] ✅ Depósito processado com sucesso')
      } else if (isWithdraw) {
        console.log('[WEBHOOK STARPAGO] === PROCESSANDO WITHDRAW ===', {
          userId,
          originalAmount: amount,
          orderNo,
          tradeNo,
          merOrderNo
        })

        // Calcular taxa
        const { totalAmount, feeAmount, netAmount } = await walletController.calculatePixOutFee(userId, amount)
        console.log('[WEBHOOK STARPAGO] Taxa calculada para saque:', {
          originalAmount: amount,
          totalAmount,
          feeAmount,
          netAmount
        })

        // Gerar external_id se não foi fornecido no webhook
        const starpagoWithdrawExternalId = body.external_id || body.externalId || `mutual_${merOrderNo || orderNo || tradeNo || Date.now()}-${crypto.randomUUID()}`
        
        // Transação 1: Débito na wallet do usuário (valor total = original + taxa)
        console.log('[WEBHOOK STARPAGO] Transação 1: Debitando valor total da wallet do usuário:', {
          walletId: wallet.id,
          amount: totalAmount,
          currentBalance: wallet.balance
        })
        
        await WalletModel.debit(wallet.id, {
          amount: totalAmount,
          description: tradeNo ? `PIX WITHDRAW ${tradeNo}` : `PIX WITHDRAW ${orderNo}`,
          meta: {
            source: 'WEBHOOK_STARPAGO_WITHDRAW',
            provider: 'STARPAGO',
            merOrderNo,
            orderNo,
            tradeNo: tradeNo || undefined,
            e2e: tradeNo || undefined,
            status,
            type: 'PIX_WITHDRAW',
            webhookReceivedAt: new Date().toISOString(),
            originalAmount: amount,
            feeAmount,
            netAmount,
            totalAmount,
            finalAmount: netAmount,
            raw_response: (() => { try { return JSON.stringify(body) } catch { return undefined } })()
          },
          externalId: starpagoWithdrawExternalId
        })
        console.log('[WEBHOOK STARPAGO] ✅ Transação 1: Valor total debitado da wallet do usuário')

        // Transação 2: Crédito na wallet da tesouraria (se houver taxa)
        if (feeAmount > 0) {
          console.log('[WEBHOOK STARPAGO] Transação 2: Creditando taxa na tesouraria:', {
            feeAmount,
            originalAmount: amount
          })
          
          try {
            console.log('[WEBHOOK STARPAGO] Buscando wallet da tesouraria...')
            const houseWallet = await walletController.getHouseWallet('BRL')
            console.log('[WEBHOOK STARPAGO] Wallet da tesouraria obtida:', {
              walletId: houseWallet?.id,
              userId: houseWallet?.user_id,
              type: houseWallet?.type,
              balance: houseWallet?.balance
            })
            
            if (houseWallet) {
              const fees = await UserFeeModel.getByUserId(userId)
              
              console.log('[WEBHOOK STARPAGO] Creditando taxa na tesouraria:', {
                houseWalletId: houseWallet.id,
                feeAmount,
                description: `Taxa de transação - PIX OUT - Usuário ${userId}`
              })
              
              // Gerar external_id para a taxa da tesouraria
              const starpagoTreasuryFeeExternalId = `${starpagoWithdrawExternalId}-fee-treasury-pix-out`
              
              await WalletModel.credit(houseWallet.id, {
                amount: feeAmount,
                description: `Taxa de transação - PIX OUT - Usuário ${userId}`,
                meta: {
                  userId,
                  transactionType: 'PIX_OUT_FEE',
                  feeType: 'TRANSACTION_FEE',
                  originalAmount: amount,
                  feeAmount,
                  relatedTransaction: 'PIX_WITHDRAW',
                  merOrderNo,
                  orderNo,
                  tradeNo,
                  feeTypeConfig: fees?.pix_out_fee_type || 'PERCENT',
                  feeValue: fees?.pix_out_fee_type === 'FIXED' ? fees?.pix_out_fee_value : fees?.pix_out_percent,
                  provider: 'STARPAGO',
                  source: 'WEBHOOK_STARPAGO_WITHDRAW',
                  webhookReceivedAt: new Date().toISOString()
                },
                externalId: starpagoTreasuryFeeExternalId
              })
              console.log('[WEBHOOK STARPAGO] ✅ Transação 2: Taxa creditada na tesouraria com sucesso')
            } else {
              console.error('[WEBHOOK STARPAGO] ❌ Wallet da tesouraria não encontrada!')
              throw new Error('Wallet da tesouraria não encontrada')
            }
          } catch (treasuryError) {
            console.error('[WEBHOOK STARPAGO] ❌ Erro ao creditar taxa na tesouraria:', {
              error: treasuryError.message,
              stack: treasuryError.stack,
              feeAmount,
              userId
            })
            // Não lançar erro para não bloquear o débito do usuário
            // Mas logar o erro para debug
          }
        } else {
          console.log('[WEBHOOK STARPAGO] ⚠️ Nenhuma taxa a ser creditada na tesouraria (feeAmount = 0)')
          console.log('[WEBHOOK STARPAGO] ⚠️ Verifique se o usuário tem taxas configuradas!')
        }

        console.log('[WEBHOOK STARPAGO] ✅ Saque processado com sucesso')
      }
    } else {
      console.log('[WEBHOOK STARPAGO] Ignorado - status não é SUCCESS/PAID ou amount inválido:', {
        status,
        amount
      })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('[WEBHOOK STARPAGO ERROR]', {
      error: err.message,
      stack: err.stack,
      body: req.body
    })
    return res.status(500).json({ ok: false, error: 'WebhookStarPagoFailed' })
  }
})

/**
 * Payzu-specific webhook. Accepts payloads like:
 * {
 *   id, clientReference, status, type, amount, endToEndId
 * }
 */
router.post('/wallet/webhook/payzu', async (req, res) => {
  console.log('[WEBHOOK PAYZU] === INÍCIO ===', {
    body: req.body,
    timestamp: new Date().toISOString()
  })

  try {
    const body = req.body || {}
    const providerOrderNo = body.id || body.providerOrderNo
    const merOrderNo = body.clientReference || body.merOrderNo
    const endToEndId = body.endToEndId || body.tradeNo
    const status = String(body.status || '').toUpperCase()
    const amount = Number(body.amount || 0)
    const txType = String(body.type || '').toUpperCase()
    const isDeposit = txType === 'DEPOSIT'
    const isWithdraw = txType === 'WITHDRAW'

    console.log('[WEBHOOK PAYZU] Dados extraídos:', {
      providerOrderNo,
      merOrderNo,
      endToEndId,
      status,
      amount,
      txType,
      isDeposit,
      isWithdraw
    })

    // Extrair userId do merOrderNo (formato: user-{userId}-... ou withdraw-{userId}-...)
    let userId = null
    
    // Tentar buscar no body primeiro
    userId = Number(body.userId || body.user_id || 0)
    
    // Se não encontrou, tentar extrair do merOrderNo
    if ((!userId || userId <= 0) && merOrderNo) {
      const parts = merOrderNo.split('-')
      if (parts.length >= 2) {
        // Tentar extrair do formato user-{id}-... ou withdraw-{id}-...
        const possibleUserId = parts[1]
        const parsed = Number(possibleUserId)
        if (Number.isFinite(parsed) && parsed > 0) {
          userId = parsed
        }
      }
    }
    
    // Se ainda não encontrou e tem providerOrderNo, tentar buscar na tabela gateway_transactions
    // (mas isso requer acesso ao banco do gateway, então vamos tentar outras formas primeiro)

    if (!userId || userId <= 0) {
      console.log('[WEBHOOK PAYZU] Ignorado - userId inválido:', { merOrderNo, userId })
      return res.json({ ok: true, ignored: true, reason: 'Invalid userId' })
    }
    
    const user = await UserModel.findById(userId)
    if (!user) {
      console.log('[WEBHOOK PAYZU] Ignorado - usuário não encontrado:', userId)
      return res.json({ ok: true, ignored: true, reason: 'User not found' })
    }

    let wallet = await WalletModel.getUserWallet(userId, 'BRL')
    if (!wallet) wallet = await WalletModel.createUserWallet(userId, 'BRL')

    // Verificar se status é COMPLETED (equivalente a SUCCESS/PAID)
    const isCompleted = status === 'COMPLETED' || status === 'SUCCESS' || status === 'PAID'

    if (isCompleted && amount > 0) {
      // Verificar se a transação já foi processada ANTES de processar
      const alreadyProcessed = await LedgerModel.isTransactionProcessed(wallet.id, merOrderNo, providerOrderNo, endToEndId)
      if (alreadyProcessed) {
        console.log('[WEBHOOK PAYZU] ⚠️ Transação já processada, ignorando:', {
          merOrderNo,
          providerOrderNo,
          endToEndId,
          walletId: wallet.id,
          isDeposit,
          isWithdraw
        })
        return res.json({ ok: true, ignored: true, reason: 'Already processed' })
      }

      if (isDeposit) {
        console.log('[WEBHOOK PAYZU] === PROCESSANDO DEPOSIT ===', {
          userId,
          originalAmount: amount,
          providerOrderNo,
          endToEndId,
          merOrderNo
        })

        // Calcular taxa
        const { netAmount, feeAmount, totalAmount } = await walletController.calculatePixInFee(userId, amount)
        console.log('[WEBHOOK PAYZU] Taxa calculada para depósito:', {
          originalAmount: amount,
          totalAmount,
          feeAmount,
          netAmount
        })

        // Gerar external_id se não foi fornecido no webhook
        const payzuDepositExternalId = body.external_id || body.externalId || `mutual_${merOrderNo || providerOrderNo || endToEndId || Date.now()}-${crypto.randomUUID()}`
        
        // Transação 1: Crédito na wallet do usuário (valor líquido)
        console.log('[WEBHOOK PAYZU] Transação 1: Creditando valor líquido na wallet do usuário:', {
          walletId: wallet.id,
          amount: netAmount
        })
        
        await WalletModel.credit(wallet.id, {
          amount: netAmount,
          description: endToEndId ? `PIX DEPOSIT ${endToEndId}` : `PIX DEPOSIT ${providerOrderNo}`,
          meta: {
            source: 'WEBHOOK_PAYZU_DEPOSIT',
            provider: 'PAYZU',
            merOrderNo,
            providerOrderNo,
            endToEndId: endToEndId || undefined,
            e2e: endToEndId || undefined,
            status,
            type: 'PIX_DEPOSIT',
            webhookReceivedAt: new Date().toISOString(),
            originalAmount: totalAmount,
            feeAmount,
            netAmount,
            totalAmount: totalAmount,
            finalAmount: netAmount,
            raw_response: (() => { try { return JSON.stringify(body) } catch { return undefined } })()
          },
          externalId: payzuDepositExternalId
        })
        console.log('[WEBHOOK PAYZU] ✅ Transação 1: Valor líquido creditado na wallet do usuário')

        // Transação 2: Crédito na wallet da tesouraria (se houver taxa)
        if (feeAmount > 0) {
          console.log('[WEBHOOK PAYZU] Transação 2: Creditando taxa na tesouraria:', {
            feeAmount
          })
          
          const houseWallet = await walletController.getHouseWallet('BRL')
          if (houseWallet) {
            // Gerar external_id para a taxa baseado no external_id principal
            const payzuFeeExternalId = `${payzuDepositExternalId}-fee-pix-in`
            
            await WalletModel.credit(houseWallet.id, {
              amount: feeAmount,
              description: `Taxa de transação - PIX IN - Usuário ${userId}`,
              meta: {
                userId,
                transactionType: 'PIX_IN_FEE',
                feeType: 'TRANSACTION_FEE',
                originalAmount: totalAmount,
                feeAmount,
                relatedTransaction: 'PIX_DEPOSIT',
                merOrderNo,
                providerOrderNo,
                endToEndId,
                provider: 'PAYZU',
                source: 'WEBHOOK_PAYZU_DEPOSIT',
                webhookReceivedAt: new Date().toISOString()
              },
              externalId: payzuFeeExternalId
            })
            console.log('[WEBHOOK PAYZU] ✅ Transação 2: Taxa creditada na tesouraria')
          } else {
            console.error('[WEBHOOK PAYZU] ❌ Wallet da tesouraria não encontrada!')
          }
        }

        console.log('[WEBHOOK PAYZU] ✅ Depósito processado com sucesso')
      } else if (isWithdraw) {
        console.log('[WEBHOOK PAYZU] === PROCESSANDO WITHDRAW ===', {
          userId,
          originalAmount: amount,
          providerOrderNo,
          endToEndId,
          merOrderNo
        })

        // Calcular taxa
        const { totalAmount, feeAmount, netAmount } = await walletController.calculatePixOutFee(userId, amount)
        console.log('[WEBHOOK PAYZU] Taxa calculada para saque:', {
          originalAmount: amount,
          totalAmount,
          feeAmount,
          netAmount
        })

        // Gerar external_id se não foi fornecido no webhook
        const payzuWithdrawExternalId = body.external_id || body.externalId || `mutual_${merOrderNo || providerOrderNo || endToEndId || Date.now()}-${crypto.randomUUID()}`
        
        // Transação 1: Débito na wallet do usuário (valor total = original + taxa)
        console.log('[WEBHOOK PAYZU] Transação 1: Debitando valor total da wallet do usuário:', {
          walletId: wallet.id,
          amount: totalAmount,
          currentBalance: wallet.balance
        })
        
        await WalletModel.debit(wallet.id, {
          amount: totalAmount,
          description: endToEndId ? `PIX WITHDRAW ${endToEndId}` : `PIX WITHDRAW ${providerOrderNo}`,
          meta: {
            source: 'WEBHOOK_PAYZU_WITHDRAW',
            provider: 'PAYZU',
            merOrderNo,
            providerOrderNo,
            endToEndId: endToEndId || undefined,
            e2e: endToEndId || undefined,
            status,
            type: 'PIX_WITHDRAW',
            webhookReceivedAt: new Date().toISOString(),
            originalAmount: amount,
            feeAmount,
            netAmount,
            totalAmount,
            finalAmount: netAmount,
            raw_response: (() => { try { return JSON.stringify(body) } catch { return undefined } })()
          },
          externalId: payzuWithdrawExternalId
        })
        console.log('[WEBHOOK PAYZU] ✅ Transação 1: Valor total debitado da wallet do usuário')

        // Transação 2: Crédito na wallet da tesouraria (se houver taxa)
        if (feeAmount > 0) {
          console.log('[WEBHOOK PAYZU] Transação 2: Creditando taxa na tesouraria:', {
            feeAmount,
            originalAmount: amount
          })
          
          try {
            console.log('[WEBHOOK PAYZU] Buscando wallet da tesouraria...')
            const houseWallet = await walletController.getHouseWallet('BRL')
            console.log('[WEBHOOK PAYZU] Wallet da tesouraria obtida:', {
              walletId: houseWallet?.id,
              userId: houseWallet?.user_id,
              type: houseWallet?.type,
              balance: houseWallet?.balance
            })
            
            if (houseWallet) {
              const fees = await UserFeeModel.getByUserId(userId)
              
              console.log('[WEBHOOK PAYZU] Creditando taxa na tesouraria:', {
                houseWalletId: houseWallet.id,
                feeAmount,
                description: `Taxa de transação - PIX OUT - Usuário ${userId}`
              })
              
              // Gerar external_id para a taxa da tesouraria
              const payzuTreasuryFeeExternalId = `${payzuWithdrawExternalId}-fee-treasury-pix-out`
              
              await WalletModel.credit(houseWallet.id, {
                amount: feeAmount,
                description: `Taxa de transação - PIX OUT - Usuário ${userId}`,
                meta: {
                  userId,
                  transactionType: 'PIX_OUT_FEE',
                  feeType: 'TRANSACTION_FEE',
                  originalAmount: amount,
                  feeAmount,
                  relatedTransaction: 'PIX_WITHDRAW',
                  merOrderNo,
                  providerOrderNo,
                  endToEndId,
                  feeTypeConfig: fees?.pix_out_fee_type || 'PERCENT',
                  feeValue: fees?.pix_out_fee_type === 'FIXED' ? fees?.pix_out_fee_value : fees?.pix_out_percent,
                  provider: 'PAYZU',
                  source: 'WEBHOOK_PAYZU_WITHDRAW',
                  webhookReceivedAt: new Date().toISOString()
                },
                externalId: payzuTreasuryFeeExternalId
              })
              console.log('[WEBHOOK PAYZU] ✅ Transação 2: Taxa creditada na tesouraria com sucesso')
            } else {
              console.error('[WEBHOOK PAYZU] ❌ Wallet da tesouraria não encontrada!')
              throw new Error('Wallet da tesouraria não encontrada')
            }
          } catch (treasuryError) {
            console.error('[WEBHOOK PAYZU] ❌ Erro ao creditar taxa na tesouraria:', {
              error: treasuryError.message,
              stack: treasuryError.stack,
              feeAmount,
              userId
            })
            // Não lançar erro para não bloquear o débito do usuário
            // Mas logar o erro para debug
          }
        } else {
          console.log('[WEBHOOK PAYZU] ⚠️ Nenhuma taxa a ser creditada na tesouraria (feeAmount = 0)')
          console.log('[WEBHOOK PAYZU] ⚠️ Verifique se o usuário tem taxas configuradas!')
        }

        console.log('[WEBHOOK PAYZU] ✅ Saque processado com sucesso')
      }
    } else {
      console.log('[WEBHOOK PAYZU] Ignorado - status não é COMPLETED/SUCCESS/PAID ou amount inválido:', {
        status,
        amount,
        isCompleted
      })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('[WEBHOOK PAYZU ERROR]', {
      error: err.message,
      stack: err.stack,
      body: req.body
    })
    return res.status(500).json({ ok: false, error: 'WebhookPayzuFailed' })
  }
})

/**
 * @openapi
 * /api/wallet/deposit/mwbank:
 *   post:
 *     summary: Cria depósito PIX via MWBank Provider
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Depósito MWBank criado
 */
router.post('/wallet/deposit/mwbank', async (req, res) => {
  try {
    const { userId, amount } = req.body

    if (!userId || Number(userId) <= 0)
      return res.status(400).json({ ok: false, error: 'InvalidUserId' })

    if (!amount || Number(amount) <= 0)
      return res.status(400).json({ ok: false, error: 'InvalidAmount' })

    const operatorToken = jwt.sign(
      { type: 'OPERATOR', sub: GATEWAY_OPERATOR_ID },
      JWT_OPERATOR_SECRET,
      { expiresIn: '5m' }
    )

    const payload = {
      userId,
      amount
    }

    const gatewayURL = `${env.USER_SERVICE_BASE_URL}/api/mwbank/deposit`

    const gatewayResponse = await axios.post(gatewayURL, payload, {
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        'Content-Type': 'application/json'
      }
    })

    return res.json(gatewayResponse.data)

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'MWBankDepositFailed',
      detail: err.response?.data || err.message
    })
  }
})

/**
 * @openapi
 * /api/wallet/withdraw/mwbank:
 *   post:
 *     summary: Solicita saque PIX via MWBank Provider
 *     tags: [Wallets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *               amount:
 *                 type: number
 *               key:
 *                 type: string
 *               keyType:
 *                 type: string
 *     responses:
 *       200:
 *         description: Saque MWBank criado
 */
router.post('/wallet/withdraw/mwbank', async (req, res) => {
  try {
    const { userId, amount, key, keyType } = req.body

    if (!userId || Number(userId) <= 0)
      return res.status(400).json({ ok: false, error: 'InvalidUserId' })

    if (!amount || Number(amount) <= 0)
      return res.status(400).json({ ok: false, error: 'InvalidAmount' })

    if (!key)
      return res.status(400).json({ ok: false, error: 'MissingPixKey' })

    const operatorToken = jwt.sign(
      { type: 'OPERATOR', sub: GATEWAY_OPERATOR_ID },
      JWT_OPERATOR_SECRET,
      { expiresIn: '5m' }
    )

    const payload = {
      userId,
      amount,
      key,
      keyType: keyType || 'CPF'
    }

    const gatewayURL = `${env.USER_SERVICE_BASE_URL}/api/mwbank/withdraw`

    const gatewayResponse = await axios.post(gatewayURL, payload, {
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        'Content-Type': 'application/json'
      }
    })

    return res.json(gatewayResponse.data)

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'MWBankWithdrawFailed',
      detail: err.response?.data || err.message
    })
  }
})

export default router
