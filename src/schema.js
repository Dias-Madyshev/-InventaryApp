import { query } from './db.js';

export async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS assets (
      inventory_number TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      solidary_mol TEXT,
      manufacture_date TEXT,
      accounting_date TEXT,
      useful_life_months TEXT,
      factory_number TEXT,
      passport_number TEXT,
      photo_url TEXT,
      photo_file_id TEXT,
      line_length TEXT,
      transformer_power TEXT,
      transformer_voltage TEXT,
      inventory_count TEXT,
      cost_initial TEXT,
      amortization TEXT,
      residual_value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS photo_file_id TEXT;
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS assets_name_idx ON assets (name);
  `);
}
