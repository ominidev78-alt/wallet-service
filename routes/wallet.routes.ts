import { Router } from 'express'
import { walletController } from '../controllers/WalletController.js'
import { userAuth } from '../middlewares/userAuth.js'

const router = Router()

router.get('/wallet', userAuth, (req, res, next) => { walletController.getBalance(req, res, next) })
router.get('/users/:id/wallet', userAuth, (req, res, next) => { walletController.getBalance(req, res, next) })
router.get('/wallet/ledger', userAuth, (req, res, next) => { walletController.ledger(req, res, next) })
router.get('/users/:id/wallet/ledger', userAuth, (req, res, next) => { walletController.ledger(req, res, next) })
router.post('/wallet/deposit/pix', userAuth, (req, res, next) => walletController.pixDeposit(req, res, next))
router.post('/wallet/withdraw/pix', userAuth, (req, res, next) => walletController.pixWithdraw(req, res, next))
router.get('/wallet/deposit/:orderNo/status', userAuth, (req, res, next) => { walletController.getDepositStatus(req, res) })
router.get('/wallet/withdraw/:orderNo/status', userAuth, (req, res, next) => { walletController.getWithdrawStatus(req, res) })

export default router