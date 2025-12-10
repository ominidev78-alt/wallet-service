import { Router } from 'express'
import { adminTreasuryController } from '../controllers/AdminTreasuryController.js'

const router = Router()

// GET saldo da carteira da casa
router.get('/admin/treasury/balance', (req, res) =>
  adminTreasuryController.balance(req, res)
)

// GET ledger completo da carteira da casa
router.get('/admin/treasury/ledger', (req, res) =>
  adminTreasuryController.ledger(req, res)
)

// GET resumo diário
router.get('/admin/treasury/summary/daily', (req, res) =>
  adminTreasuryController.summaryDaily(req, res)
)

// GET resumo mensal
router.get('/admin/treasury/summary/monthly', (req, res) =>
  adminTreasuryController.summaryMonthly(req, res)
)

export default router
