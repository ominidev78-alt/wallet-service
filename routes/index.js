import healthRoutes from './health.routes.js'

const router = Router()

router.use('/', healthRoutes)
router.use('/api', walletRoutes)
router.use('/api', adminWalletRoutes)
router.use('/api/internal', internalRoutes)

export default router
