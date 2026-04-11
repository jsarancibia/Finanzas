import 'dotenv/config';

import { getSupabaseService } from '../services/supabaseClient.js';

export interface CrearCuentaResponse {
  ok: boolean;
  banco: string;
  nombre: string;
  tipo: string;
  cuenta_id?: string;
  error?: string;
}

function normalizarNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Crea (o reutiliza) un banco y una cuenta para el usuario.
 * arquitectura13 — Flujo "Crear cuenta".
 */
export async function handleCrearCuentaPost(
  banco: string,
  nombre: string,
  tipo: 'disponible' | 'ahorro',
  authUserId: string,
): Promise<CrearCuentaResponse> {
  if (!authUserId?.trim()) {
    return { ok: false, banco, nombre, tipo, error: 'No autorizado.' };
  }

  const bancoTrim = banco.trim();
  const nombreTrim = nombre.trim();
  const tipoTrim = tipo === 'ahorro' ? 'ahorro' : 'disponible';

  if (!bancoTrim || !nombreTrim) {
    return { ok: false, banco, nombre, tipo, error: 'Banco y nombre son requeridos.' };
  }

  const supabase = getSupabaseService();
  const uid = authUserId.trim();

  // 1. Upsert banco por nombre normalizado + usuario
  const bancoNorm = normalizarNombre(bancoTrim);
  const { data: bancoRow, error: bancoErr } = await supabase
    .from('bancos')
    .upsert(
      { nombre: bancoTrim, nombre_normalizado: bancoNorm, auth_user_id: uid },
      { onConflict: 'auth_user_id,nombre_normalizado', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  let bancoId: string;

  if (bancoErr || !bancoRow) {
    // Si hay conflicto en upsert, buscar el existente
    const { data: existing, error: selErr } = await supabase
      .from('bancos')
      .select('id')
      .eq('auth_user_id', uid)
      .eq('nombre_normalizado', bancoNorm)
      .single();

    if (selErr || !existing) {
      return { ok: false, banco, nombre, tipo, error: 'No se pudo crear el banco.' };
    }
    bancoId = (existing as { id: string }).id;
  } else {
    bancoId = (bancoRow as { id: string }).id;
  }

  // 2. Crear la cuenta (nombre único por banco + usuario)
  const { data: cuentaRow, error: cuentaErr } = await supabase
    .from('cuentas')
    .insert({
      nombre: nombreTrim,
      tipo: tipoTrim,
      saldo: 0,
      banco_id: bancoId,
      auth_user_id: uid,
    })
    .select('id')
    .single();

  if (cuentaErr) {
    if (cuentaErr.code === '23505') {
      return { ok: false, banco: bancoTrim, nombre: nombreTrim, tipo: tipoTrim, error: 'Ya existe esa cuenta.' };
    }
    return { ok: false, banco: bancoTrim, nombre: nombreTrim, tipo: tipoTrim, error: 'No se pudo crear la cuenta.' };
  }

  return {
    ok: true,
    banco: bancoTrim,
    nombre: nombreTrim,
    tipo: tipoTrim,
    cuenta_id: (cuentaRow as { id: string }).id,
  };
}
