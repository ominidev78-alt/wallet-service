import express from 'express'
import healthRoutes from './health.routes.js'
import walletRoutes from './wallet.routes.js'
import adminWalletRoutes from './admin.wallet.routes.js'
import internalRoutes from './internal.routes.js'

const router = express.Router()

router.use('/', healthRoutes)
router.use('/api', walletRoutes)
router.use('/api', adminWalletRoutes)
router.use('/api/internal', internalRoutes)

export default router
