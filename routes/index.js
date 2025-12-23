import { Router } from 'express'
import walletRoutes from './wallet.routes.js'
import adminWalletRoutes from './admin.wallet.routes.js'
import internalRoutes from './internal.routes.js'

const router = Router()

router.get('/health', (req, res) => res.json({ ok: true, service: 'wallet-service', timestamp: new Date().toISOString() }))

router.use('/api', walletRoutes)
router.use('/api', adminWalletRoutes)
router.use('/api/internal', internalRoutes)

export default router
