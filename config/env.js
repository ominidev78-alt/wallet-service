import dotenv from 'dotenv'
dotenv.config()

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_OPERATOR_SECRET: process.env.JWT_OPERATOR_SECRET,
  HOUSE_USER_ID: process.env.HOUSE_USER_ID,
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'production'
}
