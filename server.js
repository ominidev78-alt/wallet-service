import { app } from './app.js'
import { env } from './config/env.js'
import { initDb } from './config/db.js'

async function start() {
  try {
    await initDb()

    app.listen(env.PORT, '0.0.0.0', () => {
      console.log(`wallet-service rodando na porta ${env.PORT}`)
    })
  } catch (err) {
    console.error('Erro ao iniciar wallet-service:', err)
    process.exit(1)
  }
}

start()
