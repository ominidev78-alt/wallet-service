import { Router } from 'express'
import { internalPaymentsController } from '../controllers/InternalPaymentsController.js'
import { walletController } from '../controllers/WalletController.js'

const router = Router()

/**
 * @openapi
 * tags:
 *   name: Internal
 *   description: Rotas internas usadas por outros microserviços.
 */

router.post('/payments/apply-split', (req, res, next) => internalPaymentsController.applySplit(req, res, next))
router.post('/payments/apply-withdraw', (req, res, next) => internalPaymentsController.applyWithdraw(req, res, next))

// Mutate balance for internal usage
router.post('/users/:id/wallet/mutate', (req, res, next) => walletController.mutate(req, res, next))

export default router
