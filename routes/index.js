import { Router } from 'express'

import walletRoutes from './wallet.routes.js'
import adminWalletRoutes from './admin.wallet.routes.js'
import internalRoutes from './internal.routes.js'
import feesRoutes from './fees.routes.js'
import medRoutes from './med.routes.js'
import adminTreasuryRoutes from './admin.treasury.routes.js'

const router = Router()

router.use('/api', walletRoutes)
router.use('/api', adminWalletRoutes)
router.use('/api', feesRoutes)
router.use('/api', medRoutes)
router.use('/api', adminTreasuryRoutes)

router.use('/api/internal', internalRoutes)

export default router
