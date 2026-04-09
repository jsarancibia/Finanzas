/**
 * Ejecuta en la base la función `reconciliar_saldos_cuentas()` (migración 011).
 * Recalcula saldos por cuenta desde movimientos y alinea con `balances`.
 *
 * Requiere DATABASE_URL en .env (mismo que `npm run db:apply`).
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

const db = postgres(url, { ssl: 'require', max: 1 });

try {
  const rows = await db`select public.reconciliar_saldos_cuentas() as resultado`;
  const r = rows[0]?.resultado;
  console.log(JSON.stringify(r, null, 2));
  if (r && typeof r === 'object' && r.ok === false) {
    process.exit(1);
  }
} catch (e) {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await db.end({ timeout: 5 });
}
