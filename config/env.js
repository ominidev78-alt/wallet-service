import 'dotenv/config'

export const env = {
  PORT: process.env.PORT || 4000,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_USER_SECRET: process.env.JWT_USER_SECRET || process.env.JWT_OPERATOR_SECRET || 'pagandu-secret-2025',
  JWT_OPERATOR_SECRET: process.env.JWT_OPERATOR_SECRET || 'pagandu-secret-2025',
  JWT_ADMIN_SECRET: process.env.JWT_ADMIN_SECRET || 'pagandu-admin-secret-2025',
  HOUSE_USER_ID: process.env.HOUSE_USER_ID,
  GATEWAY_OPERATOR_ID: process.env.GATEWAY_OPERATOR_ID || 1,
  GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL || 'https://payg2a.online',
  USER_SERVICE_URL: process.env.USER_SERVICE_URL || 'https://user.pagandu.com',
  WEBHOOK_SERVICE_URL: process.env.WEBHOOK_SERVICE_URL || 'https://webhook.pagandu.com'
}
