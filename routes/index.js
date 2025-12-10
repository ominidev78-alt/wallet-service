import { Router } from 'express'

import walletRoutes from './wallet.routes.js'
import adminWalletRoutes from './admin.wallet.routes.js'
import treasuryRoutes from './admin.treasury.routes.js'
import webhooksRoutes from './webhooks.routes.js'

const router = Router()

router.use('/', webhooksRoutes)
router.use('/', walletRoutes)
router.use('/', adminWalletRoutes)
router.use('/', treasuryRoutes)

export default router
