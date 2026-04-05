import type { ParsedMovimiento } from './parseMessage.js';
import { completarChat } from './llmClient.js';

const SYSTEM_PARSE = `Eres un extractor de órdenes financieras en español (Chile, CLP).
Devuelve SOLO un JSON con esta forma exacta:
{"tipo":"ingreso"|"gasto"|"ahorro"|null,"monto":number|null,"categoria":string,"descripcion":string,"origen":string|null,"destino":string|null}

Reglas:
- tipo ingreso: el usuario recibe dinero (gané, me pagaron, sueldo, etc.)
- tipo gasto: paga o compra algo (gasté, pagué, compré…)
- tipo ahorro: aparta dinero para ahorrar (ahorrar, ahorra…)
- monto: número en pesos chilenos sin separadores de miles (ej. 20000 no "20.000")
- categoria: para gastos, categoría corta si se menciona (ej. comida); si no, ""
- descripcion: texto libre breve o ""
- origen/destino: cuenta o lugar si se dice; si no, null
Si no es una orden financiera clara, usa tipo null y monto null.`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Parsing vía LLM cuando el regex no alcanza (arquitectura: regex + LLM si es necesario).
 */
export async function parseMessageWithLlm(text: string): Promise<ParsedMovimiento | null> {
  const raw = await completarChat(
    [
      { role: 'system', content: SYSTEM_PARSE },
      { role: 'user', content: text.trim() },
    ],
    { jsonMode: true },
  );

  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const tipo = parsed.tipo;
  const monto = parsed.monto;

  if (tipo !== 'ingreso' && tipo !== 'gasto' && tipo !== 'ahorro') {
    return null;
  }
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
    return null;
  }

  const categoria = typeof parsed.categoria === 'string' ? parsed.categoria : '';
  const descripcion = typeof parsed.descripcion === 'string' ? parsed.descripcion : '';
  const origen = parsed.origen === null || parsed.origen === undefined
    ? null
    : String(parsed.origen);
  const destino = parsed.destino === null || parsed.destino === undefined
    ? null
    : String(parsed.destino);

  return {
    tipo,
    monto,
    categoria,
    descripcion,
    origen,
    destino,
  };
}
