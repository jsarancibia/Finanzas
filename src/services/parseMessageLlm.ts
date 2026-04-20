import { destinoParaRegistro, type ParsedMovimiento } from './parseMessage.js';
import { inferCategoriaGasto } from './categoriasMovimiento.js';
import { completarChat } from './llmClient.js';

/**
 * Una sola tarea: extraer estructura financiera. Sin historial, sin saldos, salida JSON estricta.
 */
const SYSTEM_PARSE = `Tarea única: del mensaje en español (Chile, CLP) extrae UNA orden financiera.
Responde SOLO un objeto JSON válido, sin markdown, sin texto extra.

Claves requeridas: tipo, monto, categoria, descripcion, banco, cuenta_producto.
- tipo: "ingreso" | "gasto" | "ahorro" | null  (null si no es una orden financiera clara)
- monto: entero positivo en pesos CLP, o null si no hay cifra
- categoria: categoría normalizada. Para gastos elige SIEMPRE la más específica de esta lista:
  "comida" | "transporte" | "vestuario" | "salud" | "hogar" | "entretenimiento" |
  "educación" | "inversión" | "salario" | "otros"
  Ejemplos: zapatillas/ropa/polera → "vestuario"; uber/taxi/bencina → "transporte";
  pizza/almuerzo/supermercado → "comida"; médico/farmacia → "salud";
  cine/netflix/spotify → "entretenimiento"; arriendo/luz/agua → "hogar".
  Reserva "otros" solo si ninguna categoría encaja.
- descripcion: objeto específico del gasto (ej. "zapatillas", "pizza"), "" si no aplica
- banco: banco/billetera SOLO si aparece textualmente en el mensaje
  (ej. "Mercado Pago", "Banco Estado", "MACH", "Tenpo"); null si no se menciona
- cuenta_producto: subcuenta SOLO si se menciona (ej. "Cuenta RUT"); null si no aplica

REGLA: si el mensaje dice «desde X», «con X» o «de X» donde X es un banco → extrae banco.
Ejemplo: "gasté 10000 en zapatillas desde mercado pago"
→ {"tipo":"gasto","monto":10000,"categoria":"vestuario","descripcion":"zapatillas","banco":"Mercado Pago","cuenta_producto":null}

Coloquial CLP: lucas/palos=miles (80 lucas→80000); Nk→N×1000; cien mil→100000.
Traspaso «de X a Y» con dos cuentas → tipo null.
Asignación «del disponible sin cuenta» → tipo null.
No calcules saldos. No des consejos. No inventes datos.`;

/** Límite de caracteres enviados al modelo. */
const MAX_MENSAJE_LLM = 500;

/** Cache en memoria: evita llamadas repetidas para el mismo mensaje. */
const llmCache = new Map<string, ParsedMovimiento | null>();
const MAX_CACHE_SIZE = 150;

function cacheKey(text: string): string {
  return text.trim().toLowerCase().normalize('NFC');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Quita bloque ```json … ``` si el modelo lo añade pese al modo JSON. */
function textoJsonBruto(raw: string): string {
  const s = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(s);
  return m ? m[1].trim() : s;
}

/**
 * Verifica que las palabras clave del banco aparezcan en el texto original.
 * Evita que el LLM invente un banco que el usuario no mencionó.
 */
function bancoMencionadoEnTexto(banco: string, textoOriginal: string): boolean {
  const haystack = textoOriginal.toLowerCase().normalize('NFC');
  const palabras = banco.toLowerCase().normalize('NFC').split(/\s+/).filter(p => p.length > 2);
  return palabras.length > 0 && palabras.some(p => haystack.includes(p));
}

/**
 * Si el LLM devuelve categoria "otros" o vacía para un gasto,
 * intenta inferirla localmente usando descripcion o el texto original.
 */
function refinarCategoria(categoria: string, descripcion: string, textoOriginal: string): string {
  if (categoria && categoria !== 'otros') {
    return categoria;
  }
  const fuente = descripcion || textoOriginal;
  const inferida = inferCategoriaGasto(fuente);
  return inferida !== 'otros' ? inferida : (categoria || 'otros');
}

/**
 * Parsing vía LLM (Groq/xAI) cuando el parser local no alcanza.
 * Una sola llamada, sin historial, salida JSON estricta.
 */
export async function parseMessageWithLlm(text: string): Promise<ParsedMovimiento | null> {
  const user = text.trim();
  if (!user) {
    return null;
  }

  // Cache: devuelve resultado previo para mensajes idénticos
  const key = cacheKey(user);
  if (llmCache.has(key)) {
    console.log('[LLM] cache hit:', key.slice(0, 60));
    return llmCache.get(key) ?? null;
  }

  const recorte = user.length > MAX_MENSAJE_LLM ? `${user.slice(0, MAX_MENSAJE_LLM)}…` : user;
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
    console.warn('[LLM] sin respuesta (API falló o sin key) → fallback regex');
    llmCache.set(key, null);
    return null;
  }

  console.log('[LLM] respuesta:', raw.slice(0, 200));

  // Parseo JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(textoJsonBruto(raw)) as unknown;
  } catch {
    console.warn('[LLM] JSON inválido → fallback regex');
    llmCache.set(key, null);
    return null;
  }

  if (!isRecord(parsed)) {
    llmCache.set(key, null);
    return null;
  }

  // tipo null o desconocido → no es una orden financiera, fallback regex
  const tipo = parsed.tipo;
  if (tipo === null || tipo === undefined || tipo === 'none') {
    console.log('[LLM] tipo=null/none → fallback regex');
    llmCache.set(key, null);
    return null;
  }
  if (tipo !== 'ingreso' && tipo !== 'gasto' && tipo !== 'ahorro') {
    console.warn('[LLM] tipo desconocido:', tipo, '→ fallback regex');
    llmCache.set(key, null);
    return null;
  }

  // monto inválido → fallback regex
  const monto = parsed.monto;
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
    console.warn('[LLM] monto inválido:', monto, '→ fallback regex');
    llmCache.set(key, null);
    return null;
  }

  const categoriaRaw = typeof parsed.categoria === 'string' ? parsed.categoria : '';
  const descripcion = typeof parsed.descripcion === 'string' ? parsed.descripcion : '';

  // Refinar categoría: si LLM devuelve "otros", intentar inferir localmente
  const categoria = refinarCategoria(categoriaRaw, descripcion, user);

  // Anti-alucinación: anular banco si no aparece en el texto original
  const bancoRaw = typeof parsed.banco === 'string' ? parsed.banco.trim() : null;
  const banco =
    bancoRaw && bancoMencionadoEnTexto(bancoRaw, user) ? bancoRaw : null;

  if (bancoRaw && !banco) {
    console.warn('[LLM] banco ignorado (no está en el texto):', bancoRaw);
  }

  const cuentaRaw = parsed.cuenta_producto;
  const cuentaProducto =
    cuentaRaw === null || cuentaRaw === undefined ? null : String(cuentaRaw).trim() || null;

  const base: ParsedMovimiento = {
    tipo,
    monto,
    categoria,
    descripcion,
    origen: null,
    destino: null,
    banco,
    cuentaProducto,
  };

  const result: ParsedMovimiento = { ...base, destino: destinoParaRegistro(base) };

  // Guardar en cache (con límite de tamaño)
  if (llmCache.size >= MAX_CACHE_SIZE) {
    const firstKey = llmCache.keys().next().value;
    if (firstKey !== undefined) llmCache.delete(firstKey);
  }
  llmCache.set(key, result);

  return result;
}
