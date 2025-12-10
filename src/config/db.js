import { Pool } from 'pg'
import { env } from './env.js'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

export async function initDb() {
  console.log('[DB wallet-service] init...')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      type TEXT NOT NULL DEFAULT 'USER',
      currency TEXT NOT NULL DEFAULT 'BRL',
      balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wallets_user_id
    ON wallets(user_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id BIGSERIAL PRIMARY KEY,
      wallet_id BIGINT NOT NULL,
      direction TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      description TEXT,
      meta JSONB DEFAULT '{}'::jsonb,
      external_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ledger_wallet_id
    ON ledger_entries(wallet_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gateway_transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT,
      wallet_id BIGINT,
      direction TEXT,
      amount NUMERIC(18,2),
      original_amount NUMERIC(18,2),
      fee_amount NUMERIC(18,2),
      provider TEXT,
      provider_transaction_id TEXT,
      mer_order_no TEXT,
      status TEXT,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT,
      transaction_id TEXT,
      target_url TEXT,
      status TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_fees (
      user_id BIGINT PRIMARY KEY,
      pix_in_fee_type TEXT DEFAULT 'PERCENT',
      pix_in_fee_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      pix_out_fee_type TEXT DEFAULT 'PERCENT',
      pix_out_fee_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_two_factor_auth (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      method TEXT NOT NULL DEFAULT 'TOTP',
      secret TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      last_used_at TIMESTAMPTZ,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, method)
    );
  `)

  console.log('[DB wallet-service] ok.')
}
