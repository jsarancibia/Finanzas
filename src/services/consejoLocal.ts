import { parecePrefijoMovimientoDesdeTerminos } from '../config/loadNormalizacionTerminosChilenos.js';

/**
 * arquitectura3 — Fase 3: consejos breves y prudentes sin tocar saldos ni RPC.
 * Solo texto; no inventa datos de bancos ni productos concretos.
 */

function pareceMovimiento(t: string): boolean {
  const trim = t.trim();
  if (
    /^(gané|gane|gano|ganó|gasté|gaste|gasto|ahorr|agreg|coloc|recib|pag[uú]e|invert[ií]|inverti|deposit|saqu[eé]|guard[eé]|guarde|guard[oó]|dej[eé]|deje|dej[oó]|apart[eé]|aparte|apart[oó]|met[ií]|meti|me\s+pagaron|me\s+depositaron|me\s+lleg[oó]|me\s+llegaron)/i.test(
      trim,
    )
  ) {
    return true;
  }
  return parecePrefijoMovimientoDesdeTerminos(trim);
}

/** Saludo sin cifra: no debe pasar al parser de movimientos. */
function textoSaludoCortoSiAplica(trim: string): string | null {
  const t = trim.replace(/[!?.¿¡…]+$/gu, '').trim();
  if (t.length === 0 || t.length > 40) {
    return null;
  }
  if (
    /^(hola+|buenas|hey|ei|qué\s+tal|que\s+tal|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches)$/iu.test(
      t,
    )
  ) {
    return 'Hola. Puedes registrar ingresos, gastos o ahorros con el monto (por ejemplo: «ahorraré 15.000 en Banco Estado fondo mutuo»).';
  }
  return null;
}

/**
 * Si el mensaje pide orientación genérica (no un registro), devuelve texto corto; si no, null.
 */
export function textoConsejoSiAplica(texto: string): string | null {
  const t = texto.trim();
  const saludo = textoSaludoCortoSiAplica(t);
  if (saludo) {
    return saludo;
  }
  if (t.length < 4 || t.length > 160) {
    return null;
  }
  if (pareceMovimiento(t)) {
    return null;
  }

  const s = t.toLowerCase();

  if (/(qué|cuál|que|cual)\s+banco|mejor\s+banco|banco\s+(mejor|recomienda)|elegir\s+banco/i.test(s)) {
    return 'No recomiendo bancos concretos. Compara comisiones, requisitos de saldo y si necesitas más cuenta vista o depósito según si gastas a diario o ahorras a plazo. Usa información oficial de cada institución o comparadores del consumidor.';
  }

  if (
    /cómo\s+separar|separar\s+(el\s+)?ahorro|ahorro\s+y\s+gasto|gasto\s+y\s+ahorro/i.test(
      s,
    )
  ) {
    return 'Define un monto de ahorro al inicio del mes y mantenlo aparte del dinero para gastar (otra cuenta o sobre mental con regla fija). Empieza con un porcentaje modesto y revísalo cada mes.';
  }

  if (
    /cómo\s+organiz(o|ar)|organiz(ar|o)\s+(la\s+)?plata|ideas\s+para\s+organiz|ordenar\s+(las\s+)?finanzas/i.test(
      s,
    )
  ) {
    return 'Anota ingresos fijos y gastos que se repiten, resta y mira cuánto te queda para ahorrar sin apretarte. Revisa suscripciones y gastos chicos que se acumulan; prioriza un pequeño colchón antes de gastos discrecionales.';
  }

  if (
    /^consejos?\s+financier/i.test(s) ||
    /finanzas.*(consejo|tip|ayuda)|^(ayuda|tips?)\s+con\s+(mis\s+)?finanzas/i.test(s)
  ) {
    return 'Mantén ahorro y gasto separados, evita comprometer lo que no está planificado y revisa una vez al mes. Para registrar un movimiento, escribe el monto y si fue ingreso, gasto o ahorro.';
  }

  return null;
}
