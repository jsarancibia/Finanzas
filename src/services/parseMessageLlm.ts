import { destinoParaRegistro, type ParsedMovimiento } from './parseMessage.js';
import { completarChat } from './llmClient.js';

/**
 * Una sola tarea: extraer estructura. Sin historial (arquitectura3 — Fase 4).
 * Prohibido: saldos, consejos al usuario, prosa, markdown, repetir reglas del backend.
 */
const SYSTEM_PARSE = `Tarea única: del mensaje en español (Chile, CLP) extrae UNA orden financiera.
Responde SOLO un objeto JSON válido, sin markdown, sin texto extra.

Claves requeridas: tipo, monto, categoria, descripcion, banco, cuenta_producto.
- tipo: "ingreso" | "gasto" | "ahorro" | null
- monto: entero positivo en pesos CLP, o null si no hay cifra
- categoria: categoría normalizada del gasto (obligatoria para gastos). Usa SIEMPRE la más específica:
  "comida" | "transporte" | "vestuario" | "salud" | "hogar" | "entretenimiento" |
  "educación" | "inversión" | "salario" | "otros"
  Ejemplos: zapatillas/ropa/polera → "vestuario"; uber/taxi/bencina → "transporte";
  comida/pizza/almuerzo/supermercado → "comida"; médico/farmacia → "salud";
  cine/netflix/spotify → "entretenimiento"; arriendo/luz/agua → "hogar"
  Solo usa "otros" si no encaja en ninguna de las anteriores.
- descripcion: objeto específico del gasto (ej. "zapatillas", "pizza"), "" si no aplica
- banco: banco/billetera canónico si se menciona como origen de fondos
  (ej. "Mercado Pago", "Banco Estado", "MACH", "Tenpo"); null si no se menciona
- cuenta_producto: subcuenta (ej. "Cuenta RUT", "Cuenta Vista"); null si no aplica

REGLA: si el mensaje dice «desde X», «con X» o «de X» donde X es un banco → extrae banco siempre.
Ejemplo: "gasté 10000 en zapatillas desde mercado pago"
→ {"tipo":"gasto","monto":10000,"categoria":"vestuario","descripcion":"zapatillas","banco":"Mercado Pago","cuenta_producto":null}

Coloquial CLP: lucas/palos=miles (80 lucas→80000); Nk→N×1000; cien mil→100000.
Traspaso «de X a Y» con dos cuentas → tipo null, monto null.
Asignación «del disponible sin cuenta» → tipo null, monto null.
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

  console.log('[LLM] EXECUTED:', recorte.slice(0, 80));

  const raw = await completarChat(
    [
      { role: 'system', content: SYSTEM_PARSE },
      { role: 'user', content: recorte },
    ],
    {
      jsonMode: true,
      maxTokens: 150,
      temperature: 0.1,
    },
  );

  if (!raw) {
    console.warn('[LLM] sin respuesta (API falló o sin key)');
    return null;
  }

  console.log('[LLM] respuesta:', raw.slice(0, 200));

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
