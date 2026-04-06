import { getSupabaseService } from './supabaseClient.js';

export type BalanceRowDb = {
  saldo_disponible?: unknown;
  saldo_ahorrado?: unknown;
  saldo_disponible_sin_cuenta?: unknown;
};

function esErrorColumnaSinCuentaInexistente(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('saldo_disponible_sin_cuenta') &&
    (m.includes('does not exist') || m.includes('no existe') || m.includes('unknown'))
  );
}

/**
 * Lee todas las filas de `balances`. Si la BD no tiene migración 006 (sin columna
 * `saldo_disponible_sin_cuenta`), repite el SELECT solo con las columnas clásicas;
 * el agregado deja ese saldo en 0 y el dashboard sigue usando `huecoVsTotal` para pendiente.
 */
export async function fetchAllBalanceRows(): Promise<BalanceRowDb[]> {
  const supabase = getSupabaseService();
  const full = await supabase
    .from('balances')
    .select('saldo_disponible, saldo_ahorrado, saldo_disponible_sin_cuenta');

  if (!full.error) {
    return (full.data ?? []) as BalanceRowDb[];
  }

  if (esErrorColumnaSinCuentaInexistente(full.error.message)) {
    const partial = await supabase.from('balances').select('saldo_disponible, saldo_ahorrado');
    if (partial.error) {
      throw new Error(partial.error.message);
    }
    return (partial.data ?? []) as BalanceRowDb[];
  }

  throw new Error(full.error.message);
}
