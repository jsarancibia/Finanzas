/**
 * Borra todos los datos de finanzas en Supabase para probar desde cero.
 * Requiere DATABASE_URL en .env (misma que npm run db:apply).
 *
 * Uso: node scripts/reset-datos.mjs --yes
 */
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error(
    'Falta DATABASE_URL en .env.\n' +
      'Supabase → Settings → Database → Connection string → URI.',
  );
  process.exit(1);
}

if (!process.argv.includes('--yes')) {
  console.error('Este comando BORRA movimientos, cuentas, bancos y balances.');
  console.error('Para confirmar ejecuta:  node scripts/reset-datos.mjs --yes');
  process.exit(1);
}

const sql = `
BEGIN;
DELETE FROM public.movimientos;
DELETE FROM public.cuentas;
DELETE FROM public.bancos;
DELETE FROM public.balances;
INSERT INTO public.balances (saldo_disponible, saldo_ahorrado, saldo_disponible_sin_cuenta, ultima_actualizacion)
VALUES (0, 0, 0, now());
COMMIT;
`;

const db = postgres(url, { ssl: 'require', max: 1 });

try {
  await db.unsafe(sql);
  console.log(
    'OK: datos limpiados (movimientos, cuentas, bancos). Balances en 0 (disponible, ahorrado, sin cuenta).',
  );
} catch (e) {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await db.end({ timeout: 5 });
}
