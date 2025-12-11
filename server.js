import { app } from './app.js'
import { initDb } from './config/db.js'

async function start() {
    try {
        await initDb()

        const PORT = process.env.PORT || 3002

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`wallet-service rodando na porta ${PORT}`)
        })

    } catch (err) {
        console.error('Erro ao iniciar wallet-service:', err)
        process.exit(1)
    }
}

start()
