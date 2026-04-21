import type { Reglas } from '../config/loadReglas.js';
import { fetchAllBalanceRows } from './fetchBalancesRows.js';
import { getSupabaseService } from './supabaseClient.js';

/** Tarjeta de cuenta (disponible o ahorro/inversión), datos desde BD. */
export type TarjetaCuentaResumen = {
  nombre: string;
  banco: string | null;
  monto: number;
};

export type TarjetaGastoResumen = {
  etiqueta: string;
  monto: number;
  fecha: string | null;
};

export type ItemGastoCategoria = {
  descripcion: string;
  monto: number;
  fecha: string | null;
};

export type LineaGastoCategoria = {
  categoria: string;
  monto: number;
  items: ItemGastoCategoria[];
};

type LineaAhorro = {
  nombre: string;
  monto_ahorrado: number;
};

/** Etiqueta en panel: si la categoría es genérica «otros», mostrar la descripción cuando exista. */
function etiquetaGastoResumen(categoria: string, descripcion: string): string {
  const cat = categoria.trim();
  const desc = descripcion.trim();
  if (cat && cat !== 'otros') {
    return cat;
  }
  if (desc) {
    return desc;
  }
  return cat || 'Gasto';
}

function claveAgrupacionGasto(categoria: string, descripcion: string): string {
  const cat = categoria.trim();
  const desc = descripcion.trim();
  if (cat && cat !== 'otros') {
    return cat;
  }
  if (desc) {
    return desc;
  }
  return cat || 'Sin categoría';
}

type GrupoPorBanco = {
  banco: string;
  total: number;
  subcuentas: LineaAhorro[];
};

/**
 * Panel dashboard (arquitectura6): tres secciones; totales y listas vienen del servidor.
 */
export type ResumenDashboard = {
  moneda: string;
  saldo_disponible: number;
  /** Dinero disponible aún no asignado a ninguna cuenta (colchón en BD). */
  saldo_disponible_sin_cuenta: number;
  /**
   * Dinero aún no reflejado en cuentas «disponible»: disponible_total − suma de esas cuentas (≥ 0).
   * No usar max con `saldo_disponible_sin_cuenta`: si esa columna queda desfasada (p. ej. varias filas
   * en `balances`), el panel mostraría pendiente fantasma aunque las cuentas ya sumen el total.
   */
  dinero_pendiente_repartir: number;
  saldo_ahorrado_total: number;
  seccion_disponible: TarjetaCuentaResumen[];
  seccion_ahorro: TarjetaCuentaResumen[];
  gastos_ultimos: TarjetaGastoResumen[];
  gastos_por_categoria: LineaGastoCategoria[];
};

type CuentaRow = {
  nombre: string;
  tipo: string;
  saldo: number | string;
  bancos: unknown;
};

function nombreDesdeBancosRef(v: unknown): string | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (Array.isArray(v)) {
    const x = v[0];
    if (x && typeof x === 'object' && x !== null && 'nombre' in x) {
      const s = String((x as { nombre: unknown }).nombre).trim();
      return s || null;
    }
    return null;
  }
  if (typeof v === 'object' && v !== null && 'nombre' in v) {
    const s = String((v as { nombre: unknown }).nombre).trim();
    return s || null;
  }
  return null;
}

function cuentaToTarjeta(row: CuentaRow): TarjetaCuentaResumen {
  const m = Number(row.saldo);
  return {
    nombre: String(row.nombre ?? '').trim() || 'Cuenta',
    banco: nombreDesdeBancosRef(row.bancos),
    monto: Number.isFinite(m) ? m : 0,
  };
}

type MovAhorroRow = Record<string, unknown>;

type CuentaJoin = {
  nombre: string;
  bancos: unknown;
} | null;

function asCuentaJoin(v: unknown): CuentaJoin {
  if (v === null || v === undefined) {
    return null;
  }
  if (Array.isArray(v)) {
    return asCuentaJoin(v[0]);
  }
  if (typeof v === 'object' && v !== null && 'nombre' in v) {
    return v as CuentaJoin;
  }
  return null;
}

function ahorroDesdeMovimientos(rows: MovAhorroRow[]): TarjetaCuentaResumen[] {
  const porBancoMap = new Map<string, Map<string, number>>();
  const otrosMap = new Map<string, number>();

  for (const r of rows) {
    const m = Number(r.monto);
    if (!Number.isFinite(m) || m <= 0) {
      continue;
    }
    const cuenta = asCuentaJoin(r.cuentas);
    const nombreBanco = cuenta ? nombreDesdeBancosRef(cuenta.bancos) : null;
    const nombreCuenta = cuenta?.nombre?.trim();

    if (nombreBanco && nombreCuenta) {
      if (!porBancoMap.has(nombreBanco)) {
        porBancoMap.set(nombreBanco, new Map());
      }
      const sub = porBancoMap.get(nombreBanco)!;
      sub.set(nombreCuenta, (sub.get(nombreCuenta) ?? 0) + m);
    } else {
      const dest = r.destino;
      const label =
        dest != null && String(dest).trim() !== ''
          ? String(dest).trim()
          : 'Sin cuenta específica';
      otrosMap.set(label, (otrosMap.get(label) ?? 0) + m);
    }
  }

  const grupos: GrupoPorBanco[] = [...porBancoMap.entries()]
    .map(([banco, prodMap]) => {
      const subcuentas: LineaAhorro[] = [...prodMap.entries()]
        .filter(([, sum]) => sum > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([nombre, monto_ahorrado]) => ({ nombre, monto_ahorrado }));
      const total = subcuentas.reduce((s, x) => s + x.monto_ahorrado, 0);
      return { banco, total, subcuentas };
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);

  const otros: LineaAhorro[] = [...otrosMap.entries()]
    .filter(([, sum]) => sum > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, monto_ahorrado]) => ({ nombre, monto_ahorrado }));

  const tarjetas: TarjetaCuentaResumen[] = [];
  for (const g of grupos) {
    for (const sc of g.subcuentas) {
      tarjetas.push({
        nombre: sc.nombre,
        banco: g.banco,
        monto: sc.monto_ahorrado,
      });
    }
  }
  for (const o of otros) {
    tarjetas.push({
      nombre: o.nombre,
      banco: null,
      monto: o.monto_ahorrado,
    });
  }

  return tarjetas;
}

const MAX_GASTOS_AGREGAR = 500;
const MAX_MOV_AHORRO_AGREGAR = 10000;
const ULTIMOS_GASTOS_UI = 8;
const TOP_CATEGORIAS = 8;

function tarjetaAhorroKey(t: TarjetaCuentaResumen): string {
  const b = (t.banco ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const n = String(t.nombre ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return `${b}|${n}`;
}

/** Une agregado de movimientos con cuentas ahorro/inversión y cubre hueco vs saldo_ahorrado total. */
function construirSeccionAhorro(
  movRows: MovAhorroRow[],
  ahorroInvRows: CuentaRow[],
  saldo_ahorrado_total: number,
): TarjetaCuentaResumen[] {
  const fromMov = ahorroDesdeMovimientos(movRows);
  const fromCuentas = ahorroInvRows.map(cuentaToTarjeta);
  const byKey = new Map<string, TarjetaCuentaResumen>();
  for (const t of fromMov) {
    byKey.set(tarjetaAhorroKey(t), t);
  }
  for (const t of fromCuentas) {
    // Saldo en `cuentas` gana sobre la suma de movimientos para la misma cuenta/banco.
    byKey.set(tarjetaAhorroKey(t), t);
  }
  const list = [...byKey.values()];
  const sumCards = list.reduce((s, t) => s + (Number.isFinite(t.monto) ? t.monto : 0), 0);
  const gap = saldo_ahorrado_total - sumCards;
  if (gap > 0.5) {
    list.push({
      nombre: 'Otros / sin desglose en cuenta',
      banco: null,
      monto: gap,
    });
  }
  if (list.length === 0 && saldo_ahorrado_total > 0) {
    return [
      {
        nombre: 'Total ahorrado',
        banco: null,
        monto: saldo_ahorrado_total,
      },
    ];
  }
  return list.sort((a, b) => b.monto - a.monto);
}

export async function obtenerResumenDashboard(
  reglas: Reglas,
  authUserId: string,
): Promise<ResumenDashboard> {
  const supabase = getSupabaseService();

  const [cuentasRes, movAhorroRes, gastosRes, balRows] = await Promise.all([
    supabase
      .from('cuentas')
      .select('nombre, tipo, saldo, banco_id, bancos(nombre)')
      .eq('auth_user_id', authUserId)
      .order('saldo', { ascending: false }),
    supabase
      .from('movimientos')
      .select('monto, destino, cuenta_id, cuentas(nombre, banco_id, bancos(nombre))')
      .eq('auth_user_id', authUserId)
      .eq('tipo', 'ahorro')
      .order('fecha', { ascending: false })
      .limit(MAX_MOV_AHORRO_AGREGAR),
    supabase
      .from('movimientos')
      .select('monto, categoria, descripcion, fecha')
      .eq('auth_user_id', authUserId)
      .eq('tipo', 'gasto')
      .order('fecha', { ascending: false })
      .limit(MAX_GASTOS_AGREGAR),
    fetchAllBalanceRows(authUserId),
  ]);

  if (cuentasRes.error) {
    throw new Error(cuentasRes.error.message);
  }
  if (movAhorroRes.error) {
    throw new Error(movAhorroRes.error.message);
  }
  if (gastosRes.error) {
    throw new Error(gastosRes.error.message);
  }

  let saldo_disponible = 0;
  let saldo_disponible_sin_cuenta = 0;
  let saldo_ahorrado_total = 0;
  for (const row of balRows) {
    const d = row.saldo_disponible;
    const a = row.saldo_ahorrado;
    const sc = row.saldo_disponible_sin_cuenta;
    if (d != null && Number.isFinite(Number(d))) {
      saldo_disponible += Number(d);
    }
    if (a != null && Number.isFinite(Number(a))) {
      saldo_ahorrado_total += Number(a);
    }
    if (sc != null && Number.isFinite(Number(sc))) {
      saldo_disponible_sin_cuenta += Number(sc);
    }
  }

  const cuentasRaw = (cuentasRes.data ?? []) as CuentaRow[];

  const disponibleRows = cuentasRaw.filter((c) => c.tipo === 'disponible');
  const seccion_disponible: TarjetaCuentaResumen[] = disponibleRows.map(cuentaToTarjeta);

  const sumaCuentasDisponible = disponibleRows.reduce((s, row) => {
    const m = Number(row.saldo);
    return s + (Number.isFinite(m) ? m : 0);
  }, 0);

  const huecoVsTotal = Math.max(0, saldo_disponible - sumaCuentasDisponible);
  const dinero_pendiente_repartir = Math.min(saldo_disponible, huecoVsTotal);

  if (seccion_disponible.length === 0 && saldo_disponible > 0 && dinero_pendiente_repartir === 0) {
    seccion_disponible.push({
      nombre: 'Disponible',
      banco: null,
      monto: saldo_disponible,
    });
  }

  const ahorroInvRows = cuentasRaw.filter(
    (c) => c.tipo === 'ahorro' || c.tipo === 'inversion',
  );
  const movRowsAhorro = (movAhorroRes.data ?? []) as MovAhorroRow[];
  const seccion_ahorro = construirSeccionAhorro(
    movRowsAhorro,
    ahorroInvRows,
    saldo_ahorrado_total,
  );

  const gastosRows = gastosRes.data ?? [];
  const gastos_ultimos: TarjetaGastoResumen[] = [];
  for (let i = 0; i < Math.min(ULTIMOS_GASTOS_UI, gastosRows.length); i++) {
    const row = gastosRows[i] as Record<string, unknown>;
    const m = Number(row.monto);
    if (!Number.isFinite(m) || m <= 0) {
      continue;
    }
    const cat = typeof row.categoria === 'string' ? row.categoria.trim() : '';
    const desc = typeof row.descripcion === 'string' ? row.descripcion.trim() : '';
    const etiqueta = etiquetaGastoResumen(cat, desc);
    const fecha =
      row.fecha != null && String(row.fecha).trim() !== '' ? String(row.fecha) : null;
    gastos_ultimos.push({ etiqueta, monto: m, fecha });
  }

  type CatEntry = { total: number; items: ItemGastoCategoria[] };
  const byCat = new Map<string, CatEntry>();
  for (const row of gastosRows) {
    const r = row as Record<string, unknown>;
    const m = Number(r.monto);
    if (!Number.isFinite(m) || m <= 0) {
      continue;
    }
    const catRaw = typeof r.categoria === 'string' ? r.categoria.trim() : '';
    const descRaw = typeof r.descripcion === 'string' ? r.descripcion.trim() : '';
    const cat = claveAgrupacionGasto(catRaw, descRaw);
    const entry = byCat.get(cat) ?? { total: 0, items: [] };
    entry.total += m;
    const fechaRaw = r.fecha != null && String(r.fecha).trim() !== '' ? String(r.fecha) : null;
    entry.items.push({ descripcion: descRaw || catRaw || cat, monto: m, fecha: fechaRaw });
    byCat.set(cat, entry);
  }
  const gastos_por_categoria: LineaGastoCategoria[] = [...byCat.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, TOP_CATEGORIAS)
    .map(([categoria, { total, items }]) => ({ categoria, monto: total, items }));

  return {
    moneda: reglas.moneda.trim() || 'CLP',
    saldo_disponible,
    saldo_disponible_sin_cuenta,
    dinero_pendiente_repartir,
    saldo_ahorrado_total,
    seccion_disponible,
    seccion_ahorro,
    gastos_ultimos,
    gastos_por_categoria,
  };
}
