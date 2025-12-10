import { WebhookLogModel } from '../models/WebhookLogModel.js'
import { HttpError } from '../core/HttpError.js'
import { LedgerModel } from '../models/LedgerModel.js'
import { walletController } from './WalletController.js'
import axios from 'axios'

class WebhookController {
	async incoming(req, res, next) {
		try {
			const sourceUrl =
				req.headers['x-source-url'] ||
				req.headers['x-webhook-source'] ||
				null

			const eventType =
				req.headers['x-event-type'] ||
				req.body?.event_type ||
				req.body?.type ||
				'transaction.webhook'

			const transactionId =
				req.body?.tradeNo ||
				req.body?.orderNo ||
				req.body?.transactionId ||
				req.body?.transaction_id ||
				null

			const payload = req.body || null

			let targetUrl = null
			let user = null

			const rawUserId =
				req.body?.user_id ||
				req.body?.userId ||
				req.body?.uid ||
				null

			if (rawUserId) {
				const userId = Number(rawUserId)
				if (Number.isFinite(userId)) {
					user = await UserModel.findById(userId)
					if (user && user.webhook_url) {
						targetUrl = user.webhook_url
					}
				}
			}

			if (!targetUrl) {
				targetUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`
			}

			const inserted = await WebhookLogModel.insert({
				event_type: String(eventType),
				transaction_id: transactionId ? String(transactionId) : null,
				target_url: targetUrl,
				status: null,
				payload
			})

			return res.status(200).json({
				ok: true,
				id: inserted?.id,
				created_at: inserted?.created_at
			})
		} catch (err) {
			next(err)
		}
	}
	async history(req, res, next) {
		try {
			const {
				dateFrom,
				dateTo,
				type,
				status,
				url,
				transactionId,
				page = '1',
				pageSize = '10'
			} = req.query

			const pageNum = Math.max(parseInt(page, 10) || 1, 1)
			const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100)
			const offset = (pageNum - 1) * sizeNum

			const { rows, total } = await WebhookLogModel.search({
				dateFrom,
				dateTo,
				type,
				status,
				url,
				transactionId,
				limit: sizeNum,
				offset
			})

			return res.json({
				ok: true,
				data: rows,
				pagination: {
					page: pageNum,
					pageSize: sizeNum,
					total
				}
			})
		} catch (err) {
			next(err)
		}
	}
	async resend(req, res, next) {
		try {
			const { ids } = req.body || {}
			if (!Array.isArray(ids) || !ids.length) {
				throw new HttpError(400, 'MissingWebhookIds')
			}

			const logs = await WebhookLogModel.findByIds(
				ids.map((v) => Number(v)).filter((n) => Number.isFinite(n))
			)

			let success = 0
			for (const log of logs) {
				const target = log.target_url
				const payload = (() => {
					try {
						return typeof log.payload === 'string'
							? JSON.parse(log.payload)
							: log.payload
					} catch {
						return null
					}
				})()

				if (!target || !payload) {
					await WebhookLogModel.appendRetry(
						log.id,
						{
							http_status: null,
							latency_ms: null,
							response_body: null,
							error: 'Missing target/payload'
						}
					)
					continue
				}

				const start = Date.now()

				try {
					const r = await axios.post(target, payload, {
						headers: { 'Content-Type': 'application/json' }
					})

					const latency = Date.now() - start

					if (refundError) {
						throw refundError
					}

					const mockReq = {
						body: payload
					}
					
					let refundError = null
					
					const mockRes = {
						json: (data) => {
							refundResponse = data
							return mockRes
						},
						status: (code) => {
							refundStatusCode = code
							return {
								json: (data) => {
									refundResponse = data
									return mockRes
								}
							}
						}
					}
					
					const mockNext = (err) => {
						if (err) {
							refundError = err
						}
					}

					await walletController.pixRefund(mockReq, mockRes, mockNext)
					await WebhookLogModel.appendRetry(
						log.id,
						{
							http_status: r.status,
							latency_ms: latency,
							response_body: JSON.stringify(r.data || null),
							error: null
						}
					)

					if (r.status >= 200 && r.status < 300) success++

				} catch (e) {
					const latency = Date.now() - start
					const status = e?.response?.status || null
					const respBody = (() => {
						try {
							return JSON.stringify(e?.response?.data || null)
						} catch {
							return null
						}
					})()

					await WebhookLogModel.appendRetry(
						log.id,
						{
							http_status: status,
							latency_ms: latency,
							response_body: respBody,
							error: e?.message || 'Request failed'
						}
					)
				}
			}

			return res.json({
				ok: true,
				requeued: logs.length,
				delivered: success
			})
		} catch (err) {
			next(err)
		}
	}
	async ledgerWebhook(req, res, next) {
		try {
			const { ledgerId } = req.params
			if (!ledgerId) throw new HttpError(400, 'MissingLedgerId')

			const ledger = await LedgerModel.findById(Number(ledgerId))
			if (!ledger) throw new HttpError(404, 'LedgerNotFound')

			const user = await UserModel.findById(ledger.user_id)
			if (!user) throw new HttpError(404, 'UserNotFound')

			const payload = {
				event: 'ledger.transaction',
				ledger_id: ledger.id,
				user_id: ledger.user_id,
				amount: ledger.amount,
				type: ledger.type,
				balance_before: ledger.balance_before,
				balance_after: ledger.balance_after,
				meta: ledger.meta || {},
				created_at: ledger.created_at
			}

			const targetUrl = user.webhook_url || null

			const inserted = await WebhookLogModel.insert({
				event_type: 'ledger.transaction',
				transaction_id: String(ledger.id),
				target_url: targetUrl,
				status: null,
				payload
			})

			return res.json({
				ok: true,
				ledger_id: ledger.id,
				webhook_log_id: inserted.id
			})
		} catch (err) {
			next(err)
		}
	}
}

export const webhookController = new WebhookController()
