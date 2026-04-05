import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Variable de entorno requerida ausente o vacía: ${name}`);
  }
  return value.trim();
}

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');

const serverAuth = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * Cliente con anon key: comprobaciones ligeras; no usar para RPC privilegiados.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: serverAuth,
});

let supabaseService: SupabaseClient | null = null;

/**
 * Cliente con service role: solo en este backend, nunca en el navegador.
 * Necesario para RPC como `aplicar_movimiento` (revocado a anon en BD).
 */
export function getSupabaseService(): SupabaseClient {
  if (supabaseService === null) {
    const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    supabaseService = createClient(supabaseUrl, key, { auth: serverAuth });
  }
  return supabaseService;
}

/** Tabla ficticia solo para comprobar que PostgREST responde; no debe existir en el proyecto. */
const CONNECTIVITY_PROBE = '__finanzas_connectivity_probe__';

/**
 * Comprueba que la URL y la anon key son válidas haciendo una petición mínima a la API REST.
 * Si la tabla no existe pero el servidor responde con error esperado, la conexión se considera correcta.
 */
async function fetchProbeTable() {
  try {
    return await supabase.from(CONNECTIVITY_PROBE).select('*').limit(1);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`No se pudo alcanzar Supabase (red o URL incorrecta): ${message}`, {
      cause,
    });
  }
}

export async function testSupabaseConnectivity(): Promise<void> {
  const { error } = await fetchProbeTable();
  if (!error) {
    return;
  }

  const msg = error.message ?? '';
  const code = error.code ?? '';

  const tableMissing =
    code === 'PGRST205' ||
    code === '42P01' ||
    /schema cache|does not exist|Could not find the table|relation.*does not exist/i.test(msg);

  if (tableMissing) {
    return;
  }

  if (/jwt|invalid.*api|API key|Unauthorized/i.test(msg)) {
    throw new Error(`Credenciales inválidas o sin acceso: ${msg}`);
  }

  throw new Error(`Respuesta inesperada de Supabase: ${msg || code || 'error desconocido'}`);
}
