import { destinoParaRegistro, type ParsedMovimiento } from './parseMessage.js';
import { completarChat } from './llmClient.js';

/**
 * Una sola tarea: extraer estructura. Sin historial (arquitectura3 — Fase 4).
 * Prohibido: saldos, consejos al usuario, prosa, markdown, repetir reglas del backend.
 */
const SYSTEM_PARSE = `Tarea única: del siguiente mensaje en español (Chile, CLP) extrae UNA posible orden financiera.
Responde solo un objeto JSON válido, sin markdown, sin texto antes ni después.

Claves obligatorias: tipo, monto, categoria, descripcion, origen, destino.
Opcionales si el mensaje los menciona: banco, cuenta_producto (string o null).
- tipo: "ingreso" | "gasto" | "ahorro" | null
- monto: entero positivo en pesos CLP o null si no hay cifra clara
- categoria, descripcion: string cortos; vacío "" si no aplica
- origen, destino: string corto o null
- banco: nombre del banco canónico (ej. "Banco Estado") o null
- cuenta_producto: producto o subcuenta (ej. "Cuenta RUT", "Fondo mutuo") o null

Coloquial CLP: lucas/palos = miles (80 lucas→80000); Nk→N×1000; cien mil→100000.
Un movimiento por mensaje. Varios montos sin total claro → tipo null, monto null.
Traspaso entre cuentas con patrón «de … a …» (ej. Cuenta RUT a Mercado Pago) → tipo null y monto null (otro módulo lo resuelve).
Asignación «del disponible sin cuenta … en/a cuenta X» con monto → tipo null y monto null (otro módulo lo resuelve).
No calcules ni menciones saldos. No des consejos. No inventes cifras.`;

/** Límite de caracteres del usuario al modelo (costo y foco). */
const MAX_MENSAJE_LLM = 700;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Quita cerco \`\`\`json si el modelo lo añade. */
function textoJsonBruto(raw: string): string {
  const s = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(s);
  if (m) {
    return m[1].trim();
  }
  return s;
}

/**
 * Parsing vía Grok cuando el parser local no alcanza (Fase 4: prompt breve, salida estricta).
 */
export async function parseMessageWithLlm(text: string): Promise<ParsedMovimiento | null> {
  const user = text.trim();
  if (!user) {
    return null;
  }
  const recorte =
    user.length > MAX_MENSAJE_LLM ? `${user.slice(0, MAX_MENSAJE_LLM)}…` : user;

  const raw = await completarChat(
    [
      { role: 'system', content: SYSTEM_PARSE },
      { role: 'user', content: recorte },
    ],
    {
      jsonMode: true,
      maxTokens: 160,
      temperature: 0.1,
    },
  );

  if (!raw) {
    return null;
  }

  const jsonText = textoJsonBruto(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
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

  const bancoRaw = parsed.banco;
  const cuentaRaw = parsed.cuenta_producto;
  const banco =
    bancoRaw === null || bancoRaw === undefined ? null : String(bancoRaw).trim() || null;
  const cuentaProducto =
    cuentaRaw === null || cuentaRaw === undefined ? null : String(cuentaRaw).trim() || null;

  const base: ParsedMovimiento = {
    tipo,
    monto,
    categoria,
    descripcion,
    origen,
    destino,
    banco,
    cuentaProducto,
  };

  return {
    ...base,
    destino: destinoParaRegistro(base),
  };
}
