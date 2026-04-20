import { destinoParaRegistro, type ParsedMovimiento } from './parseMessage.js';
import { completarChat } from './llmClient.js';

/**
 * Una sola tarea: extraer estructura. Sin historial (arquitectura3 — Fase 4).
 * Prohibido: saldos, consejos al usuario, prosa, markdown, repetir reglas del backend.
 */
const SYSTEM_PARSE = `Tarea única: del mensaje en español (Chile, CLP) extrae UNA orden financiera.
Responde SOLO un objeto JSON válido, sin markdown, sin texto extra.

Claves requeridas: tipo, monto, categoria, descripcion, origen, destino, banco, cuenta_producto.
- tipo: "ingreso" | "gasto" | "ahorro" | null
- monto: entero positivo en pesos CLP, o null si no hay cifra
- categoria: string corto (ej. "zapatillas", "comida", "transporte"); "" si no aplica
- descripcion: detalle adicional breve; "" si no aplica
- origen, destino: string corto o null
- banco: nombre canónico del banco/billetera mencionado como origen de fondos
  (ej. "Mercado Pago", "Banco Estado", "MACH", "Tenpo", "BancoChile"); null si no se menciona
- cuenta_producto: subcuenta o producto dentro del banco
  (ej. "Cuenta RUT", "Cuenta Vista", "Cuenta Corriente"); null si no aplica

REGLA CLAVE: si el mensaje contiene «desde X», «con X», «via X», «de X» o «usando X»
donde X es un banco o billetera → extrae siempre banco (y cuenta_producto si corresponde).
Ejemplo: "gasté 10000 en zapatillas desde mercado pago"
→ {"tipo":"gasto","monto":10000,"categoria":"zapatillas","descripcion":"","origen":null,"destino":null,"banco":"Mercado Pago","cuenta_producto":null}

Coloquial CLP: lucas/palos=miles (80 lucas→80000); Nk→N×1000; cien mil→100000.
Un movimiento por mensaje. Varios montos sin total claro → tipo null, monto null.
Traspaso «de X a Y» con dos cuentas → tipo null, monto null (otro módulo lo resuelve).
Asignación «del disponible sin cuenta … a cuenta X» → tipo null, monto null (otro módulo).
«del dinero a repartir» / «pendiente de repartir» → tipo null, monto null.
No calcules saldos. No des consejos. No inventes cifras.`;

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
      maxTokens: 200,
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
