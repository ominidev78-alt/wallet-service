import { Router } from 'express'
import { userFeeController } from '../controllers/UserFeeController.js'
import { adminAuth } from '../middlewares/adminAuth.js'
import { userAuth } from '../middlewares/userAuth.js'

const router = Router()

/**
 * @openapi
 * tags:
 *   name: UserFees
 *   description: Tarifas de Pix IN e Pix OUT configuradas por usuário.
 */

/**
 * @openapi
 * /api/admin/users/{id}/fees:
 *   get:
 *     summary: Consulta tarifas Pix do usuário (admin)
 *     tags: [UserFees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tarifas atuais do usuário.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/admin/users/:id/fees', adminAuth, (req, res, next) =>
  userFeeController.adminGetUserFees(req, res, next)
)

/**
 * @openapi
 * /api/admin/users/{id}/fees:
 *   patch:
 *     summary: Define tarifas Pix do usuário (admin)
 *     tags: [UserFees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pixInPercent
 *               - pixOutPercent
 *             properties:
 *               pixInPercent:
 *                 type: number
 *                 format: float
 *                 example: 1.5
 *               pixOutPercent:
 *                 type: number
 *                 format: float
 *                 example: 2.0
 *     responses:
 *       200:
 *         description: Tarifas configuradas com sucesso.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch('/admin/users/:id/fees', adminAuth, (req, res, next) =>
  userFeeController.adminSetUserFees(req, res, next)
)

/**
 * @openapi
 * /api/me/fees:
 *   get:
 *     summary: Consulta as tarifas Pix da conta logada
 *     tags: [UserFees]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tarifas atuais da conta do usuário.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/me/fees', userAuth, (req, res, next) =>
  userFeeController.getMyFees(req, res, next)
)

export default router
