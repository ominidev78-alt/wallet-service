import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export const env = {
  PORT: process.env.PORT || 4001,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  JWT_OPERATOR_SECRET: process.env.JWT_OPERATOR_SECRET,
  HOUSE_USER_ID: process.env.HOUSE_USER_ID
}
