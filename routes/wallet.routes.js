import { Router } from 'express'
import { walletController } from '../controllers/WalletController.js'

const router = Router()

/**
 * @openapi
 * tags:
 *   name: Wallets
 *   description: Operações de saldo, extrato, depósito Pix e saque Pix.
 */

router.get('/wallet', (req, res, next) => walletController.getBalance(req, res, next))
router.get('/users/:id/wallet', (req, res, next) => walletController.getBalance(req, res, next))
router.get('/wallet/ledger', (req, res, next) => walletController.ledger(req, res, next))
router.get('/users/:id/wallet/ledger', (req, res, next) => walletController.ledger(req, res, next))

router.post('/wallet/deposit/pix', (req, res, next) => walletController.pixDeposit(req, res, next))
router.post('/wallet/withdraw/pix', (req, res, next) => walletController.pixWithdraw(req, res, next))

router.get('/wallet/deposit/:orderNo/status', (req, res, next) => walletController.getDepositStatus(req, res, next))
router.get('/wallet/withdraw/:orderNo/status', (req, res, next) => walletController.getWithdrawStatus(req, res, next))

export default router
