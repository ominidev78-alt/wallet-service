import { Pool } from 'pg'
import { env } from './env.js'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

export async function initDb() {
  console.log('[DB user-service] init...')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      external_id TEXT,
      name TEXT NOT NULL,
      email TEXT,
      document TEXT,
      cnpj TEXT,
      company_name TEXT,
      trade_name TEXT,
      partner_name TEXT,
      cnpj_data JSONB,
      doc_status TEXT DEFAULT 'PENDING',
      doc_status_notes TEXT,
      doc_status_updated_at TIMESTAMPTZ,
      gateway_fee_percent NUMERIC(5,2) DEFAULT 0,
      partner_fee_percent NUMERIC(5,2) DEFAULT 100,
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_cnpj
    ON users(cnpj);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_external_id
    ON users(external_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BRL',
      balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wallets_user_id
    ON wallets(user_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id BIGSERIAL PRIMARY KEY,
      wallet_id BIGINT REFERENCES wallets(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      description TEXT,
      meta JSONB,
      external_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ledger_wallet_id
    ON ledger_entries(wallet_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ledger_external_id
    ON ledger_entries(external_id);
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='ledger_entries' AND column_name='external_id'
      ) THEN
        ALTER TABLE ledger_entries ADD COLUMN external_id TEXT NOT NULL DEFAULT '';
        UPDATE ledger_entries SET external_id = 'legacy-' || id::text WHERE external_id = '';
      END IF;
    END $$;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_fees (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      pix_in_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
      pix_out_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
      pix_in_fee_type TEXT DEFAULT 'PERCENT',
      pix_in_fee_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      pix_out_fee_type TEXT DEFAULT 'PERCENT',
      pix_out_fee_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='user_fees' AND column_name='pix_in_fee_type'
      ) THEN
        ALTER TABLE user_fees ADD COLUMN pix_in_fee_type TEXT DEFAULT 'PERCENT';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='user_fees' AND column_name='pix_in_fee_value'
      ) THEN
        ALTER TABLE user_fees ADD COLUMN pix_in_fee_value NUMERIC(18,2) NOT NULL DEFAULT 0;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='user_fees' AND column_name='pix_out_fee_type'
      ) THEN
        ALTER TABLE user_fees ADD COLUMN pix_out_fee_type TEXT DEFAULT 'PERCENT';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='user_fees' AND column_name='pix_out_fee_value'
      ) THEN
        ALTER TABLE user_fees ADD COLUMN pix_out_fee_value NUMERIC(18,2) NOT NULL DEFAULT 0;
      END IF;
    END $$;
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_fees_user_id
    ON user_fees(user_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_two_factor_auth (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_two_factor_user_id
    ON user_two_factor_auth(user_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_two_factor_enabled
    ON user_two_factor_auth(user_id, enabled) WHERE enabled = TRUE;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_recovery_codes (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_id
    ON user_recovery_codes(user_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_recovery_codes_unused
    ON user_recovery_codes(user_id, used) WHERE used = FALSE;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS two_factor_audit_log (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      method TEXT NOT NULL,
      context TEXT,
      ip_address TEXT,
      user_agent TEXT,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      failure_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_2fa_audit_user_id
    ON two_factor_audit_log(user_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_2fa_audit_created_at
    ON two_factor_audit_log(created_at DESC);
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='password_hash'
      ) THEN
        ALTER TABLE users ADD COLUMN password_hash TEXT;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='role'
      ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER';
      END IF;
    END $$;
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='provider'
      ) THEN
        ALTER TABLE users ADD COLUMN provider TEXT;
      END IF;
    END $$;
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='webhook_url'
      ) THEN
        ALTER TABLE users ADD COLUMN webhook_url TEXT NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='ip_whitelist'
      ) THEN
        ALTER TABLE users ADD COLUMN ip_whitelist TEXT NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='webhook_url_pix_in') THEN
        ALTER TABLE users ADD COLUMN webhook_url_pix_in TEXT NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='webhook_url_pix_out') THEN
        ALTER TABLE users ADD COLUMN webhook_url_pix_out TEXT NULL;
      END IF;
    END $$;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS providers (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      base_url TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_providers_code
    ON providers(code);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_providers_active
    ON providers(active);
  `)

  console.log('[DB user-service] ok.')
}
