import express from 'express'
import { medDisputeController } from '../controllers/MedDisputeController.js'
import { adminAuth } from '../middlewares/adminAuth.js'
import { userAuth } from '../middlewares/userAuth.js'

const router = express.Router()

/**
 * @openapi
 * tags:
 *   name: MedDisputes
 *   description: Gestão de disputas (MED) de transações Pix.
 */

/**
 * @openapi
 * /api/admin/med:
 *   get:
 *     summary: Lista disputas MED
 *     tags:
 *       - MedDisputes
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ALL, OPEN, UNDER_REVIEW, DEFENSE_SENT, REFUND_ACCEPTED, REFUND_REJECTED, EXPIRED, CLOSED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de disputas MED.
 */
router.get('/admin/med', adminAuth, (req, res, next) =>
  medDisputeController.list(req, res, next)
)

/**
 * @openapi
 * /api/admin/med/summary:
 *   get:
 *     summary: Sumário de disputas MED
 *     tags:
 *       - MedDisputes
 *     responses:
 *       200:
 *         description: Sumário com quantidade e valor bloqueado.
 */
router.get('/admin/med/summary', adminAuth, (req, res, next) =>
  medDisputeController.summary(req, res, next)
)

/**
 * @openapi
 * /api/admin/med/{id}:
 *   get:
 *     summary: Detalhe de uma disputa MED
 *     tags:
 *       - MedDisputes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes da disputa.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/admin/med/:id', adminAuth, (req, res, next) =>
  medDisputeController.detail(req, res, next)
)

/**
 * @openapi
 * /api/admin/med/{id}/defense:
 *   post:
 *     summary: Registra defesa e anexos de uma disputa MED
 *     tags:
 *       - MedDisputes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defenseText:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     filename:
 *                       type: string
 *                     mimeType:
 *                       type: string
 *     responses:
 *       200:
 *         description: Defesa registrada.
 */
router.post('/admin/med/:id/defense', adminAuth, (req, res, next) =>
  medDisputeController.saveDefense(req, res, next)
)

/**
 * @openapi
 * /api/admin/med/{id}/action:
 *   post:
 *     summary: Executa ação administrativa sobre uma disputa MED
 *     tags:
 *       - MedDisputes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [ACCEPT_REFUND, REJECT_REFUND, MARK_UNDER_REVIEW]
 *               note:
 *                 type: string
 *               amount:
 *                 type: number
 *                 format: float
 *     responses:
 *       200:
 *         description: Ação executada.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/admin/med/:id/action', adminAuth, (req, res, next) =>
  medDisputeController.action(req, res, next)
)

/**
 * @openapi
 * /api/admin/med/{id}/attachments:
 *   get:
 *     summary: Lista anexos de uma disputa MED
 *     tags:
 *       - MedDisputes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de anexos da disputa.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/admin/med/:id/attachments', adminAuth, (req, res, next) =>
  medDisputeController.attachments(req, res, next)
)

/**
 * @openapi
 * /api/admin/med/{id}/user:
 *   get:
 *     summary: Retorna o usuário relacionado à disputa MED
 *     tags:
 *       - MedDisputes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Dados do usuário e carteira.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/admin/med/:id/user', adminAuth, (req, res, next) =>
  medDisputeController.user(req, res, next)
)

/**
 * @openapi
 * /api/admin/med/{id}/transaction:
 *   get:
 *     summary: Retorna informações da transação original vinculada à disputa MED
 *     tags:
 *       - MedDisputes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Dados da transação vinculada.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/admin/med/:id/transaction', adminAuth, (req, res, next) =>
  medDisputeController.transaction(req, res, next)
)

/**
 * @openapi
 * /api/med:
 *   get:
 *     summary: Lista disputas MED do usuário autenticado
 *     tags:
 *       - MedDisputes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ALL, OPEN, UNDER_REVIEW, DEFENSE_SENT, REFUND_ACCEPTED, REFUND_REJECTED, EXPIRED, CLOSED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de disputas MED do usuário.
 *       401:
 *         description: Não autorizado
 */
router.get('/med', userAuth, (req, res, next) =>
  medDisputeController.listMyDisputes(req, res, next)
)

/**
 * @openapi
 * /api/med/summary:
 *   get:
 *     summary: Sumário de disputas MED do usuário autenticado
 *     tags:
 *       - MedDisputes
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sumário com quantidade e valor bloqueado do usuário.
 *       401:
 *         description: Não autorizado
 */
router.get('/med/summary', userAuth, (req, res, next) =>
  medDisputeController.getMySummary(req, res, next)
)

/**
 * @openapi
 * /api/med/{id}:
 *   get:
 *     summary: Detalhe de uma disputa MED do usuário autenticado
 *     tags:
 *       - MedDisputes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes da disputa.
 *       403:
 *         description: Acesso negado (disputa não pertence ao usuário)
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/med/:id', userAuth, (req, res, next) =>
  medDisputeController.getMyDisputeDetail(req, res, next)
)

/**
 * @openapi
 * /api/med/{id}/defense:
 *   post:
 *     summary: Registra defesa e anexos de uma disputa MED do usuário autenticado
 *     tags:
 *       - MedDisputes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defenseText:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     filename:
 *                       type: string
 *                     mimeType:
 *                       type: string
 *     responses:
 *       200:
 *         description: Defesa registrada.
 *       403:
 *         description: Acesso negado (disputa não pertence ao usuário)
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/med/:id/defense', userAuth, (req, res, next) =>
  medDisputeController.saveMyDefense(req, res, next)
)

/**
 * @openapi
 * /api/med/{id}/attachments:
 *   get:
 *     summary: Lista anexos de uma disputa MED do usuário autenticado
 *     tags:
 *       - MedDisputes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de anexos da disputa.
 *       403:
 *         description: Acesso negado (disputa não pertence ao usuário)
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/med/:id/attachments', userAuth, (req, res, next) =>
  medDisputeController.getMyDisputeAttachments(req, res, next)
)

/**
 * @openapi
 * /api/med/{id}/transaction:
 *   get:
 *     summary: Retorna informações da transação original vinculada à disputa MED do usuário autenticado
 *     tags:
 *       - MedDisputes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Dados da transação vinculada.
 *       403:
 *         description: Acesso negado (disputa não pertence ao usuário)
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/med/:id/transaction', userAuth, (req, res, next) =>
  medDisputeController.getMyDisputeTransaction(req, res, next)
)

export default router
