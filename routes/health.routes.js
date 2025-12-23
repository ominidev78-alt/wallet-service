import express from 'express'
import { healthController } from '../controllers/HealthController.js'

const router = express.Router()

router.get('/health', (req, res) => healthController.health(req, res))

export default router
