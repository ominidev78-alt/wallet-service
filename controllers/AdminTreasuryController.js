import { WalletModel } from '../models/WalletModel.js'
import { HttpError } from '../core/HttpError.js'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'
import { UserModel } from '../models/UserModel.js'
//NEW
class AdminTreasuryController {

  async getHouseWallet(currency) {
    const finalCurrency = (currency || 'BRL').toUpperCase()

    let houseUserId = null

    // Prioridade 1: Buscar usuário com is_treasury = TRUE
    try {
      const treasuryUser = await UserModel.findTreasuryUser()
      if (treasuryUser && treasuryUser.id) {
        houseUserId = treasuryUser.id
      }
    } catch (err) {
      // Se o campo is_treasury não existir, continua para usar HOUSE_USER_ID
      console.log('[AdminTreasuryController.getHouseWallet] Erro ao buscar via findTreasuryUser:', err.message)
    }

    // Prioridade 2: Usar HOUSE_USER_ID do .env
    if (!houseUserId || Number.isNaN(houseUserId)) {
      const raw = env.HOUSE_USER_ID
      houseUserId = raw ? parseInt(raw, 10) : null
    }

    if (!houseUserId || Number.isNaN(houseUserId)) {
      throw new HttpError(500, 'HouseUserNotConfigured', {
        message: 'Nenhum usuário de tesouraria encontrado. Configure HOUSE_USER_ID no .env ou defina is_treasury=TRUE no banco.'
      })
    }

    // Verificar se o usuário existe
    const user = await UserModel.findById(houseUserId)
    if (!user) {
      throw new HttpError(500, 'HouseUserNotFound', {
        message: `Usuário de tesouraria com ID ${houseUserId} não encontrado no banco de dados`
      })
    }

    const wallet = await WalletModel.getOrCreateHouseWallet(houseUserId, finalCurrency)

    // Verificar se a wallet tem type = 'HOUSE'
    if (wallet && wallet.type !== 'HOUSE') {
      throw new HttpError(500, 'InvalidHouseWalletType', {
        message: `Wallet encontrada não é do tipo HOUSE. Tipo atual: ${wallet.type}`
      })
    }

    return wallet
  }

  async balance(req, res, next) {
    try {
      const wallet = await this.getHouseWallet(req.query.currency)

      // Adicionar headers para evitar cache
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')

      return res.json({
        ok: true,
        data: {
          walletId: wallet.id,
          userId: wallet.user_id,
          currency: wallet.currency,
          balance: wallet.balance
        }
      })
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        error: err.code || 'Error',
        message: err.message,
        details: err.details || null
      })
    }
  }

  async ledger(req, res, next) {
    try {
      const wallet = await this.getHouseWallet(req.query.currency)

      console.log('[AdminTreasuryController.ledger] === INÍCIO ===', {
        walletId: wallet.id,
        currency: wallet.currency,
        query: req.query
      })

      let limit = Number(req.query.limit || 100)
      if (!Number.isFinite(limit) || limit <= 0 || limit > 1000) limit = 100

      const from = req.query.from || null
      const to = req.query.to || null

      // Verificar se há transações na wallet (debug)
      const checkQuery = `SELECT COUNT(*) as total FROM ledger_entries WHERE wallet_id = $1`
      const checkResult = await pool.query(checkQuery, [wallet.id])
      const totalTransactions = Number(checkResult.rows[0]?.total || 0)

      // Verificar todas as wallets do usuário de tesouraria
      const allWalletsQuery = `SELECT id, type, currency, balance FROM wallets WHERE user_id = $1`
      const allWalletsResult = await pool.query(allWalletsQuery, [wallet.user_id])
      
      // Verificar transações em todas as wallets do usuário
      let totalTransactionsAllWallets = 0
      const walletTransactions = {}
      for (const w of allWalletsResult.rows) {
        const countQuery = `SELECT COUNT(*) as total FROM ledger_entries WHERE wallet_id = $1`
        const countResult = await pool.query(countQuery, [w.id])
        const count = Number(countResult.rows[0]?.total || 0)
        totalTransactionsAllWallets += count
        walletTransactions[w.id] = { count, type: w.type, currency: w.currency }
      }

      console.log('[AdminTreasuryController.ledger] Verificação de transações:', {
        walletId: wallet.id,
        walletType: wallet.type,
        walletUserId: wallet.user_id,
        totalTransactionsInWallet: totalTransactions,
        allWallets: allWalletsResult.rows.map(w => ({ id: w.id, type: w.type, currency: w.currency })),
        walletTransactions: walletTransactions,
        totalTransactionsAllWallets: totalTransactionsAllWallets
      })

      const params = [wallet.id]
      let where = `wallet_id = $1`

      if (from) {
        params.push(from)
        where += ` AND created_at >= $${params.length}`
      }

      if (to) {
        params.push(to)
        where += ` AND created_at <= $${params.length}`
      }

      params.push(limit)

      console.log('[AdminTreasuryController.ledger] Parâmetros da query:', {
        walletId: wallet.id,
        from,
        to,
        limit,
        where
      })

      const query = `
        SELECT
          le.id,
          le.wallet_id,
          le.direction,
          le.amount,
          le.description,
          le.meta,
          le.external_id,
          le.created_at,
          u.id as user_id,
          u.name as user_name,
          u.email as user_email
        FROM ledger_entries le
        LEFT JOIN users u ON 
          CASE 
            WHEN le.meta->>'userId' ~ '^[0-9]+$' THEN (le.meta->>'userId')::bigint = u.id
            ELSE false
          END
        WHERE ${where}
        ORDER BY le.created_at DESC
        LIMIT $${params.length}
      `

      const { rows } = await pool.query(query, params)

      console.log('[AdminTreasuryController.ledger] Resultado da query:', {
        rowsCount: rows.length,
        sampleRow: rows[0] || null,
        totalTransactionsInWallet: totalTransactions,
        queryParams: { walletId: wallet.id, from, to, limit }
      })

      // Se não houver transações no período mas houver na wallet, buscar todas (sem filtro de data)
      if (rows.length === 0 && totalTransactions > 0 && (from || to)) {
        console.log('[AdminTreasuryController.ledger] ⚠️ Nenhuma transação no período filtrado, mas há transações na wallet. Buscando todas...')
        const allQuery = `
          SELECT
            le.id,
            le.wallet_id,
            le.direction,
            le.amount,
            le.description,
            le.meta,
            le.external_id,
            le.created_at,
            u.id as user_id,
            u.name as user_name,
            u.email as user_email
          FROM ledger_entries le
          LEFT JOIN users u ON 
            CASE 
              WHEN le.meta->>'userId' ~ '^[0-9]+$' THEN (le.meta->>'userId')::bigint = u.id
              ELSE false
            END
          WHERE le.wallet_id = $1
          ORDER BY le.created_at DESC
          LIMIT $2
        `
        const allResult = await pool.query(allQuery, [wallet.id, limit])
        console.log('[AdminTreasuryController.ledger] Resultado da query sem filtro de data:', {
          rowsCount: allResult.rows.length,
          sampleRow: allResult.rows[0] || null
        })
        
        if (allResult.rows.length > 0) {
          const items = allResult.rows.map(row => {
            let meta = {}
            try {
              meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : (row.meta || {})
            } catch (e) {
              meta = {}
            }

            return {
              id: row.id,
              wallet_id: row.wallet_id,
              type: row.direction,
              amount: Number(row.amount),
              description: row.description,
              created_at: row.created_at,
              userId: meta.userId || row.user_id || null,
              userName: row.user_name || null,
              userEmail: row.user_email || null,
              transactionType: meta.transactionType || null,
              feeType: meta.feeType || null,
              merOrderNo: meta.merOrderNo || null,
              providerOrderNo: meta.providerOrderNo || null,
              provider: meta.provider || null
            }
          })

          console.log('[AdminTreasuryController.ledger] Items processados (sem filtro):', {
            itemsCount: items.length,
            sampleItem: items[0] || null
          })

          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')

          return res.json({
            ok: true,
            data: items
          })
        }
      }

      // Processar e formatar os dados
      const items = rows.map(row => {
        let meta = {}
        try {
          meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : (row.meta || {})
        } catch (e) {
          meta = {}
        }

        return {
          id: row.id,
          wallet_id: row.wallet_id,
          type: row.direction,
          amount: Number(row.amount),
          description: row.description,
          created_at: row.created_at,
          // Informações do usuário
          userId: meta.userId || row.user_id || null,
          userName: row.user_name || null,
          userEmail: row.user_email || null,
          // Informações adicionais do meta
          transactionType: meta.transactionType || null,
          feeType: meta.feeType || null,
          merOrderNo: meta.merOrderNo || null,
          providerOrderNo: meta.providerOrderNo || null,
          provider: meta.provider || null
        }
      })

      console.log('[AdminTreasuryController.ledger] Items processados:', {
        itemsCount: items.length,
        sampleItem: items[0] || null
      })

      // Adicionar headers para evitar cache
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')

      return res.json({
        ok: true,
        data: items
      })
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        error: err.code || 'Error',
        message: err.message,
        details: err.details || null
      })
    }
  }

  async summaryDaily(req, res, next) {
    try {
      const wallet = await this.getHouseWallet(req.query.currency)

      console.log('[AdminTreasuryController.summaryDaily] === INÍCIO ===', {
        walletId: wallet.id,
        currency: wallet.currency,
        query: req.query
      })

      const now = new Date()
      // Ajustar para buscar últimos 30 dias por padrão (para garantir que pegue todas as transações)
      const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const from = req.query.from || defaultFrom.toISOString()
      const to = req.query.to || now.toISOString()
      
      console.log('[AdminTreasuryController.summaryDaily] Período de busca:', {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        fromDate: new Date(from).toLocaleString('pt-BR'),
        toDate: new Date(to).toLocaleString('pt-BR')
      })

      // Primeiro, verificar se há transações na wallet (debug)
      const checkQuery = `SELECT COUNT(*) as total FROM ledger_entries WHERE wallet_id = $1`
      const checkResult = await pool.query(checkQuery, [wallet.id])
      const totalTransactions = Number(checkResult.rows[0]?.total || 0)

      // Verificar todas as wallets do usuário de tesouraria
      const allWalletsQuery = `SELECT id, type, currency, balance FROM wallets WHERE user_id = $1`
      const allWalletsResult = await pool.query(allWalletsQuery, [wallet.user_id])
      
      // Verificar transações em todas as wallets do usuário
      let totalTransactionsAllWallets = 0
      for (const w of allWalletsResult.rows) {
        const countQuery = `SELECT COUNT(*) as total FROM ledger_entries WHERE wallet_id = $1`
        const countResult = await pool.query(countQuery, [w.id])
        totalTransactionsAllWallets += Number(countResult.rows[0]?.total || 0)
      }

      console.log('[AdminTreasuryController.summaryDaily] Verificação de transações:', {
        walletId: wallet.id,
        walletType: wallet.type,
        walletUserId: wallet.user_id,
        totalTransactionsInWallet: totalTransactions,
        allWallets: allWalletsResult.rows.map(w => ({ id: w.id, type: w.type, currency: w.currency })),
        totalTransactionsAllWallets: totalTransactionsAllWallets
      })

      const params = [wallet.id, from, to]

      console.log('[AdminTreasuryController.summaryDaily] Parâmetros da query:', {
        walletId: wallet.id,
        from,
        to,
        params
      })

      const query = `
        SELECT
          date_trunc('day', created_at)::date AS date,
          SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS total_in,
          SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS total_out,
          COUNT(*) AS operations
        FROM ledger_entries
        WHERE wallet_id = $1
          AND created_at BETWEEN $2 AND $3
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 30
      `

      const { rows } = await pool.query(query, params)

      console.log('[AdminTreasuryController.summaryDaily] Resultado da query:', {
        rowsCount: rows.length,
        rows: rows,
        totalTransactionsInWallet: totalTransactions,
        walletId: wallet.id
      })

      // Se não houver transações no período, mas houver transações na wallet, buscar todas
      if (rows.length === 0 && totalTransactions > 0) {
        console.log('[AdminTreasuryController.summaryDaily] ⚠️ Nenhuma transação no período, mas há transações na wallet. Buscando todas...')
        const allQuery = `
          SELECT
            date_trunc('day', created_at)::date AS date,
            SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS total_in,
            SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS total_out,
            COUNT(*) AS operations
          FROM ledger_entries
          WHERE wallet_id = $1
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT 30
        `
        const allResult = await pool.query(allQuery, [wallet.id])
        console.log('[AdminTreasuryController.summaryDaily] Resultado da query sem filtro de data:', {
          rowsCount: allResult.rows.length,
          rows: allResult.rows
        })
        
        // Usar os resultados sem filtro se houver
        if (allResult.rows.length > 0) {
          const items = allResult.rows.map(row => {
            let dateStr = '';
            if (row.date instanceof Date) {
              dateStr = row.date.toISOString().split('T')[0];
            } else if (typeof row.date === 'string') {
              dateStr = row.date.split('T')[0];
            } else if (row.date) {
              dateStr = new Date(row.date).toISOString().split('T')[0];
            }

            return {
              date: dateStr,
              total_in: Number(row.total_in || 0),
              total_out: Number(row.total_out || 0),
              net_amount: Number(row.total_in || 0) - Number(row.total_out || 0),
              operations: Number(row.operations || 0)
            };
          })

          console.log('[AdminTreasuryController.summaryDaily] Items processados (sem filtro):', {
            itemsCount: items.length,
            items: items
          })

          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')

          return res.json({
            ok: true,
            data: items
          })
        }
      }

      const items = rows.map(row => {
        // Tratar a data corretamente (pode ser Date, string ou outro formato)
        let dateStr = '';
        if (row.date instanceof Date) {
          dateStr = row.date.toISOString().split('T')[0];
        } else if (typeof row.date === 'string') {
          dateStr = row.date.split('T')[0];
        } else if (row.date) {
          dateStr = new Date(row.date).toISOString().split('T')[0];
        }

        return {
          date: dateStr,
          total_in: Number(row.total_in || 0),
          total_out: Number(row.total_out || 0),
          net_amount: Number(row.total_in || 0) - Number(row.total_out || 0),
          operations: Number(row.operations || 0)
        };
      })

      console.log('[AdminTreasuryController.summaryDaily] Items processados:', {
        itemsCount: items.length,
        items: items
      })

      // Adicionar headers para evitar cache
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')

      return res.json({
        ok: true,
        data: items
      })
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        error: err.code || 'Error',
        message: err.message,
        details: err.details || null
      })
    }
  }

  async summaryMonthly(req, res, next) {
    try {
      const wallet = await this.getHouseWallet(req.query.currency)

      console.log('[AdminTreasuryController.summaryMonthly] === INÍCIO ===', {
        walletId: wallet.id,
        currency: wallet.currency,
        query: req.query
      })

      const now = new Date()
      const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1)

      const from = req.query.from || defaultFrom.toISOString()
      const to = req.query.to || now.toISOString()

      const params = [wallet.id, from, to]

      console.log('[AdminTreasuryController.summaryMonthly] Parâmetros da query:', {
        walletId: wallet.id,
        from,
        to,
        params
      })

      const query = `
        SELECT
          date_trunc('month', created_at)::date AS date,
          SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS total_in,
          SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS total_out,
          COUNT(*) AS operations
        FROM ledger_entries
        WHERE wallet_id = $1
          AND created_at BETWEEN $2 AND $3
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 12
      `

      const { rows } = await pool.query(query, params)

      console.log('[AdminTreasuryController.summaryMonthly] Resultado da query:', {
        rowsCount: rows.length,
        rows: rows
      })

      const items = rows.map(row => {
        // Tratar a data corretamente (pode ser Date, string ou outro formato)
        let dateStr = '';
        if (row.date instanceof Date) {
          dateStr = row.date.toISOString().substring(0, 7); // YYYY-MM
        } else if (typeof row.date === 'string') {
          dateStr = row.date.substring(0, 7);
        } else if (row.date) {
          dateStr = new Date(row.date).toISOString().substring(0, 7);
        }

        return {
          date: dateStr,
          total_in: Number(row.total_in || 0),
          total_out: Number(row.total_out || 0),
          net_amount: Number(row.total_in || 0) - Number(row.total_out || 0),
          operations: Number(row.operations || 0)
        };
      })

      console.log('[AdminTreasuryController.summaryMonthly] Items processados:', {
        itemsCount: items.length,
        items: items
      })

      // Adicionar headers para evitar cache
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')

      return res.json({
        ok: true,
        data: items
      })
    } catch (err) {
      console.error('[AdminTreasuryController.summaryMonthly] Erro:', err)
      return res.status(err.status || 500).json({
        ok: false,
        error: err.code || 'Error',
        message: err.message,
        details: err.details || null
      })
    }
  }
}

export const adminTreasuryController = new AdminTreasuryController()
