import { obtenerUltimosMensajesParaContexto } from './memoriaContexto.js';
import { destinoParaRegistro, type ParsedMovimiento } from './parseMessage.js';
import { inferCategoriaGasto } from './categoriasMovimiento.js';
import { completarChat, type ChatMessage } from './llmClient.js';

const SYSTEM_PARSE =
  'Extrae tipo, monto, categoria, banco, cuenta_producto, descripcion y referencia. ' +
  'Permite acciones como borrar o corregir basadas en contexto reciente. ' +
  'Responde SOLO JSON con: ' +
  '{"tipo":"gasto|ingreso|ahorro|asignacion|retiro_cuenta|borrar|corregir|none","monto":number|null,"categoria":string|null,"banco":string|null,"cuenta_producto":string|null,"descripcion":string|null,"referencia":"ultima_operacion"|null}. ' +
  'Usa tipo "retiro_cuenta" cuando el usuario RETIRA/SACA/SACA sacó dinero DESDE una cuenta de AHORRO o INVERSIÓN ' +
  '(ej. reservas de Mercado Pago, fondo mutuo). NO uses "gasto" para eso: "gasto" descuenta el saldo DISPONIBLE del panel, no el ahorro. ' +
  'En retiro_cuenta obligatorio banco Y cuenta_producto (nombre exacto de la cuenta, ej: reservas, fondo mutuo). ' +
  'No inventes bancos. Usa "otros" solo si no hay mejor categoria para gastos normales. ' +
  'zapatillas->vestuario, uber->transporte, pizza/comida->comida.';

/** Límite corto para mantener bajo el consumo de tokens. */
const MAX_MENSAJE_LLM = 220;
const MAX_CONTEXTO_LLM = 140;

/** Cache en memoria: evita llamadas repetidas para el mismo mensaje. */
const llmCache = new Map<string, ParsedMovimiento | null>();
const MAX_CACHE_SIZE = 150;

function cacheKey(text: string): string {
  return text.trim().toLowerCase().normalize('NFC');
}

function recortarPlano(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function requiereContextoReciente(text: string): boolean {
  const t = text.toLowerCase().normalize('NFC');
  return /\b(borra|borra[r]?|elimina|eliminar|corrige|corregir|ajusta|ajustar|eso|esa|ese|lo anterior|últim[oa]|ultimo|anterior)\b/u.test(
    t,
  );
}

function construirMensajesModelo(user: string): { messages: ChatMessage[]; usaContexto: boolean } {
  const current = recortarPlano(user, MAX_MENSAJE_LLM);
  if (!requiereContextoReciente(current)) {
    return {
      usaContexto: false,
      messages: [
        { role: 'system', content: SYSTEM_PARSE },
        { role: 'user', content: current },
      ],
    };
  }

  const recientes = obtenerUltimosMensajesParaContexto();
  const ultimos = recientes.slice(-2);
  const contexto = ultimos
    .map((m) => `${m.rol}: ${recortarPlano(m.texto, MAX_CONTEXTO_LLM)}`)
    .join('\n');

  if (!contexto) {
    return {
      usaContexto: false,
      messages: [
        { role: 'system', content: SYSTEM_PARSE },
        { role: 'user', content: current },
      ],
    };
  }

  return {
    usaContexto: true,
    messages: [
      { role: 'system', content: SYSTEM_PARSE },
      { role: 'assistant', content: `Contexto reciente:\n${contexto}` },
      { role: 'user', content: current },
    ],
  };
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

  const key = cacheKey(user);
  const { messages, usaContexto } = construirMensajesModelo(user);

  // Cache solo para mensajes autocontenidos; evita cachear referencias tipo "corrige eso".
  if (!usaContexto && llmCache.has(key)) {
    console.log('[LLM] cache hit:', key.slice(0, 60));
    return llmCache.get(key) ?? null;
  }

  console.log('[LLM] EXECUTED:', recortarPlano(user, 80));

  const raw = await completarChat(
    messages,
    {
      jsonMode: true,
      maxTokens: 120,
      temperature: 0.1,
    },
  );

  if (!raw) {
    console.warn('[LLM] sin respuesta (API falló o sin key) → fallback regex');
    if (!usaContexto) {
      llmCache.set(key, null);
    }
    return null;
  }

  console.log('[LLM] respuesta:', raw.slice(0, 200));

  // Parseo JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(textoJsonBruto(raw)) as unknown;
  } catch {
    console.warn('[LLM] JSON inválido → fallback regex');
    if (!usaContexto) {
      llmCache.set(key, null);
    }
    return null;
  }

  if (!isRecord(parsed)) {
    if (!usaContexto) {
      llmCache.set(key, null);
    }
    return null;
  }

  const tipo = parsed.tipo;
  if (tipo === null || tipo === undefined || tipo === 'none') {
    console.log('[LLM] tipo=null/none → fallback regex');
    if (!usaContexto) {
      llmCache.set(key, null);
    }
    return null;
  }
  if (tipo === 'borrar' || tipo === 'corregir') {
    console.log('[LLM] accion contextual → fallback a correcciones/reglas locales');
    return null;
  }
  if (
    tipo !== 'ingreso' &&
    tipo !== 'gasto' &&
    tipo !== 'ahorro' &&
    tipo !== 'asignacion' &&
    tipo !== 'retiro_cuenta'
  ) {
    console.warn('[LLM] tipo desconocido:', tipo, '→ fallback regex');
    if (!usaContexto) {
      llmCache.set(key, null);
    }
    return null;
  }

  const monto = parsed.monto;
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
    console.warn('[LLM] monto inválido:', monto, '→ fallback regex');
    if (!usaContexto) {
      llmCache.set(key, null);
    }
    return null;
  }

  const categoriaRaw = typeof parsed.categoria === 'string' ? parsed.categoria : '';
  const descripcion = typeof parsed.descripcion === 'string' ? parsed.descripcion : '';

  const categoria =
    tipo === 'retiro_cuenta' ? (categoriaRaw || 'retiro') : refinarCategoria(categoriaRaw, descripcion, user);

  const bancoRaw = typeof parsed.banco === 'string' ? parsed.banco.trim() : null;

  const banco =
    tipo === 'retiro_cuenta'
      ? bancoRaw && bancoRaw.length > 0
        ? bancoRaw
        : null
      : bancoRaw && bancoMencionadoEnTexto(bancoRaw, user)
        ? bancoRaw
        : null;

  if (tipo !== 'retiro_cuenta' && bancoRaw && !banco) {
    console.warn('[LLM] banco ignorado (no está en el texto):', bancoRaw);
  }

  const cuentaRaw = parsed.cuenta_producto;
  const cuentaProducto =
    cuentaRaw === null || cuentaRaw === undefined ? null : String(cuentaRaw).trim() || null;

  if (tipo === 'retiro_cuenta') {
    const baseRc: ParsedMovimiento = {
      tipo: 'retiro_cuenta',
      monto,
      categoria,
      descripcion: descripcion || 'retiro desde ahorro',
      origen: null,
      destino: null,
      banco,
      cuentaProducto,
    };
    const resultRc: ParsedMovimiento = { ...baseRc, destino: destinoParaRegistro(baseRc) };
    if (!usaContexto) {
      if (llmCache.size >= MAX_CACHE_SIZE) {
        const firstKey = llmCache.keys().next().value;
        if (firstKey !== undefined) llmCache.delete(firstKey);
      }
      llmCache.set(key, resultRc);
    }
    return resultRc;
  }

  const base: ParsedMovimiento = {
    tipo: tipo === 'asignacion' ? 'ingreso' : tipo,
    monto,
    categoria,
    descripcion,
    origen: null,
    destino: null,
    banco,
    cuentaProducto,
  };

  const result: ParsedMovimiento = { ...base, destino: destinoParaRegistro(base) };

  if (!usaContexto) {
    if (llmCache.size >= MAX_CACHE_SIZE) {
      const firstKey = llmCache.keys().next().value;
      if (firstKey !== undefined) llmCache.delete(firstKey);
    }
    llmCache.set(key, result);
  }

  return result;
}
