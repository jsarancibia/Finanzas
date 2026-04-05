/**
 * Ejecuta en orden todos los *.sql en supabase/migrations/ (por nombre de archivo).
 * Requiere DATABASE_URL en .env (Supabase → Settings → Database → URI).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error(
    'Falta DATABASE_URL en .env.\n' +
      'Supabase → Settings → Database → Connection string → URI.',
  );
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('No hay archivos .sql en', migrationsDir);
  process.exit(1);
}

const db = postgres(url, { ssl: 'require', max: 1 });

try {
  for (const file of files) {
    const full = path.join(migrationsDir, file);
    const sql = fs.readFileSync(full, 'utf8');
    console.log('Aplicando:', file);
    await db.unsafe(sql);
  }
  console.log('OK: migraciones aplicadas:', files.join(', '));
} catch (e) {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await db.end({ timeout: 5 });
}
