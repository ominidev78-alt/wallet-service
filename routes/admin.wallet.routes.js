import { Router } from 'express';
import { adminWalletController } from '../controllers/AdminWalletController.js';
import { adminAuth } from '../middlewares/adminAuth.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   name: AdminWallet
 *   description: Operações de carteira dos usuários no painel admin
 */

/**
 * @openapi
 * /api/admin/wallet/{id}:
 *   get:
 *     summary: Consulta a carteira (wallet) de um usuário
 *     tags: [AdminWallet]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: BRL
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Carteira retornada com sucesso
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/admin/wallet/:id', adminAuth, (req, res, next) =>
  adminWalletController.getUserWallet(req, res, next)
);

/**
 * @openapi
 * /api/admin/wallet/{id}:
 *   get:
 *     summary: Consulta a carteira (wallet) da house
 *     tags: [AdminWallet]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: BRL
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Carteira retornada com sucesso
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/admin/wallet/house/:id', adminAuth, (req, res, next) =>
  adminWalletController.getHouseWallet(req, res, next)
);

/**
 * @openapi
 * /api/admin/wallet/{id}/ledger:
 *   get:
 *     summary: Lista o extrato (ledger) da carteira do usuário
 *     tags: [AdminWallet]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 100
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de lançamentos da carteira
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/admin/wallet/:id/ledger', adminAuth, (req, res, next) =>
  adminWalletController.getUserLedger(req, res, next)
);

/**
 * @openapi
 * /api/admin/wallet/{id}/balance:
 *   patch:
 *     summary: Ajusta o saldo da carteira do usuário (crédito/débito)
 *     tags: [AdminWallet]
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
 *             required:
 *               - type
 *               - amount
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [CREDIT, DEBIT]
 *               amount:
 *                 type: number
 *                 format: float
 *               description:
 *                 type: string
 *                 example: Ajuste manual de saldo
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Saldo ajustado com sucesso
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch('/admin/wallet/:id/balance', adminAuth, (req, res, next) =>
  adminWalletController.adjustBalance(req, res, next)
);

export default router;
