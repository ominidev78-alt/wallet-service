import { Router } from 'express'
import { webhookController } from '../controllers/WebhookController.js'

const router = Router()

router.get('/webhooks/history', (req, res, next) =>
	webhookController.history(req, res, next)
)

router.post('/webhooks/resend', (req, res, next) =>
	webhookController.resend(req, res, next)
)


router.post('/webhooks/incoming', (req, res, next) =>
	webhookController.incoming(req, res, next)
)

router.post('/webhooks/ledger/:ledgerId', (req, res, next) =>
	webhookController.ledgerWebhook(req, res, next)
)

export default router
