/**
 * arquitectura3 — Fase 3: categorías simples a partir del texto libre (solo heurística local).
 */

const TRANS = /uber|taxi|colectivo|micro|metro|bencina|combustible|peaje|estacionamiento|transporte|locomoci[oó]n/i;
const FOOD =
  /comida|restaurante?|almuerzo|cena|supermercado|delivery|uber\s*eats|rappi|pedidos/i;
const OCIO = /cine|netflix|spotify|streaming|videojuego|bar|ocio|salida/i;
const SALARIO = /sueldo|salario|n[oó]mina|remuneraci[oó]n/i;
const INV = /fpv|acciones|etf|fondo\s+mutuo|inversi[oó]n|apv|dep[oó]sito\s+a\s+plazo/i;
const AHORRO = /ahorro|cuenta\s+ahorro|dep[oó]sito/i;

/**
 * Infiere categoría de gasto (o "otros") según palabras en el fragmento.
 */
export function inferCategoriaGasto(fragment: string): string {
  const f = fragment.toLowerCase();
  const t = TRANS.test(f);
  const c = FOOD.test(f);
  const o = OCIO.test(f);
  const i = INV.test(f);
  const count = [t, c, o, i].filter(Boolean).length;
  if (count > 1) {
    return 'otros';
  }
  if (t) {
    return 'transporte';
  }
  if (c) {
    return 'comida';
  }
  if (o) {
    return 'ocio';
  }
  if (i) {
    return 'inversión';
  }
  if (SALARIO.test(f)) {
    return 'salario';
  }
  if (AHORRO.test(f) && !t && !c) {
    return 'ahorro';
  }
  return 'otros';
}
