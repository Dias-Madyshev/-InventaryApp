import 'dotenv/config';
import { pool } from './db.js';
import { ensureSchema } from './schema.js';
import { fetchSheetRows, parseAssetsFromRows } from './sheets.js';

const UPSERT = `
INSERT INTO assets (
  inventory_number, name, solidary_mol, manufacture_date, accounting_date,
  useful_life_months, factory_number, passport_number, photo_url,
  line_length, transformer_power, transformer_voltage, inventory_count,
  cost_initial, amortization, residual_value, updated_at
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, NOW()
)
ON CONFLICT (inventory_number) DO UPDATE SET
  name = EXCLUDED.name,
  solidary_mol = EXCLUDED.solidary_mol,
  manufacture_date = EXCLUDED.manufacture_date,
  accounting_date = EXCLUDED.accounting_date,
  useful_life_months = EXCLUDED.useful_life_months,
  factory_number = EXCLUDED.factory_number,
  passport_number = EXCLUDED.passport_number,
  photo_url = COALESCE(EXCLUDED.photo_url, assets.photo_url),
  line_length = EXCLUDED.line_length,
  transformer_power = EXCLUDED.transformer_power,
  transformer_voltage = EXCLUDED.transformer_voltage,
  inventory_count = EXCLUDED.inventory_count,
  cost_initial = EXCLUDED.cost_initial,
  amortization = EXCLUDED.amortization,
  residual_value = EXCLUDED.residual_value,
  updated_at = NOW()
`;

async function importAssets() {
  const csvUrl = process.env.SHEETS_CSV_URL;
  if (!csvUrl) {
    throw new Error('SHEETS_CSV_URL не задан');
  }

  await ensureSchema();

  console.log('Скачиваю Google Sheet…');
  const rows = await fetchSheetRows(csvUrl);
  const assets = parseAssetsFromRows(rows);
  console.log(`Найдено позиций: ${assets.length}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const asset of assets) {
      await client.query(UPSERT, [
        asset.inventory_number,
        asset.name,
        asset.solidary_mol,
        asset.manufacture_date,
        asset.accounting_date,
        asset.useful_life_months,
        asset.factory_number,
        asset.passport_number,
        asset.photo_url,
        asset.line_length,
        asset.transformer_power,
        asset.transformer_voltage,
        asset.inventory_count,
        asset.cost_initial,
        asset.amortization,
        asset.residual_value,
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('Импорт завершён');
  await pool.end();
}

importAssets().catch((err) => {
  console.error(err);
  process.exit(1);
});
