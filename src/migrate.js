import 'dotenv/config';
import { pool } from './db.js';
import { ensureSchema } from './schema.js';

async function migrate() {
  await ensureSchema();
  console.log('Миграция выполнена: таблица assets готова');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
