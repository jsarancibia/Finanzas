import { destinoParaRegistro, type ParsedMovimiento } from './parseMessage.js';
import { getSupabaseService } from './supabaseClient.js';

function nombreBancoDesdeJoin(v: unknown): string {
  if (v == null) {
    return '—';
  }
  if (Array.isArray(v)) {
    const x = v[0];
    if (x && typeof x === 'object' && x !== null && 'nombre' in x) {
      const s = String((x as { nombre: unknown }).nombre).trim();
      return s || '—';
    }
    return '—';
  }
  if (typeof v === 'object' && v !== null && 'nombre' in v) {
    const s = String((v as { nombre: unknown }).nombre).trim();
    return s || '—';
  }
  return '—';
}

export type CuentaDisponibleSaldo = {
  bancoNombre: string;
  cuentaNombre: string;
  saldo: number;
};

/** Cuentas tipo `disponible` con saldo > 0 (para decidir si hay que pedir origen del gasto). */
export async function listarDisponiblesConSaldoPositivo(): Promise<CuentaDisponibleSaldo[]> {
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from('cuentas')
    .select('nombre, saldo, bancos(nombre)')
    .eq('tipo', 'disponible')
    .gt('saldo', 0)
    .order('saldo', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as { nombre?: unknown; saldo?: unknown; bancos?: unknown }[];
  const out: CuentaDisponibleSaldo[] = [];
  for (const r of rows) {
    const saldo = Number(r.saldo);
    if (!Number.isFinite(saldo) || saldo <= 0) {
      continue;
    }
    const cuentaNombre = String(r.nombre ?? '').trim() || 'Cuenta';
    const bancoNombre = nombreBancoDesdeJoin(r.bancos);
    out.push({ bancoNombre, cuentaNombre, saldo });
  }
  return out;
}

export type ResultadoReglaGastoCuenta =
  | { accion: 'aplicar'; parsed: ParsedMovimiento }
  | { accion: 'preguntar'; texto: string };

/**
 * Gasto sin banco+cuenta: si hay varias cuentas disponibles con saldo, pedir origen;
 * si hay una sola, enlazarla al movimiento para que el descuento cuadre con el panel.
 */
export async function resolverGastoCuentaAntesDeRpc(
  parsed: ParsedMovimiento,
): Promise<ResultadoReglaGastoCuenta> {
  if (parsed.tipo !== 'gasto') {
    return { accion: 'aplicar', parsed };
  }
  const b = parsed.banco?.trim();
  const c = parsed.cuentaProducto?.trim();
  if (b && c) {
    return { accion: 'aplicar', parsed };
  }

  const cuentas = await listarDisponiblesConSaldoPositivo();
  if (cuentas.length === 0) {
    return { accion: 'aplicar', parsed };
  }
  if (cuentas.length === 1) {
    const x = cuentas[0];
    const enriched: ParsedMovimiento = {
      ...parsed,
      banco: x.bancoNombre,
      cuentaProducto: x.cuentaNombre,
    };
    return {
      accion: 'aplicar',
      parsed: { ...enriched, destino: destinoParaRegistro(enriched) },
    };
  }

  const lista = cuentas.map((row) => `• ${row.bancoNombre} · ${row.cuentaNombre}`).join('\n');
  const texto = `Tienes varias cuentas con saldo. ¿De cuál descontar este gasto?\n${lista}\nEjemplos: «gasté ${parsed.monto} en café desde Mercado Pago» o «gasté ${parsed.monto} desde cuenta rut».`;
  return { accion: 'preguntar', texto };
}
