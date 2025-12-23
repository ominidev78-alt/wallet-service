import express from 'express'
import { adminTreasuryController } from '../controllers/AdminTreasuryController.js'
import { adminWalletController } from '../controllers/AdminWalletController.js'
import { adminAuth } from '../middlewares/adminAuth.js'

const router = express.Router()

/**
 * @openapi
 * /api/admin/treasury/balance:
 *   get:
 *     summary: Retorna o saldo de lucro da tesouraria (carteira HOUSE)
 *     tags:
 *       - AdminTreasury
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: BRL
 *     responses:
 *       200:
 *         description: Saldo atual da tesouraria.
 */
router.get('/admin/treasury/balance', adminAuth, (req, res, next) =>
  adminTreasuryController.balance(req, res, next)
)

/**
 * @openapi
 * /api/admin/treasury/ledger:
 *   get:
 *     summary: Lista o histórico de lançamentos da tesouraria
 *     tags:
 *       - AdminTreasury
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: BRL
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 100
 *     responses:
 *       200:
 *         description: Histórico de lançamentos.
 */
router.get('/admin/treasury/ledger', adminAuth, (req, res, next) =>
  adminTreasuryController.ledger(req, res, next)
)

/**
 * @openapi
 * /api/admin/treasury/summary/daily:
 *   get:
 *     summary: Sumário diário de faturamento da tesouraria
 *     tags:
 *       - AdminTreasury
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: BRL
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Faturamento agrupado por dia.
 */
router.get('/admin/treasury/summary/daily', adminAuth, (req, res, next) =>
  adminTreasuryController.summaryDaily(req, res, next)
)

/**
 * @openapi
 * /api/admin/treasury/summary/monthly:
 *   get:
 *     summary: Sumário mensal de faturamento da tesouraria
 *     tags:
 *       - AdminTreasury
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: BRL
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Faturamento agrupado por mês.
 */
router.get('/admin/treasury/summary/monthly', adminAuth, (req, res, next) =>
  adminTreasuryController.summaryMonthly(req, res, next)
)

export default router
