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
  const bancoNorm = normalizarNombre(bancoTrim);

  // 1. Reutilizar o crear banco (select + insert: evita fallos de upsert con índice único compuesto en PostgREST)
  const { data: bancoExistente, error: selBancoErr } = await supabase
    .from('bancos')
    .select('id')
    .eq('auth_user_id', uid)
    .eq('nombre_normalizado', bancoNorm)
    .maybeSingle();

  if (selBancoErr) {
    return {
      ok: false,
      banco,
      nombre,
      tipo,
      error: `No se pudo leer bancos: ${selBancoErr.message}`,
    };
  }

  let bancoId: string;
  if (bancoExistente && typeof (bancoExistente as { id: unknown }).id === 'string') {
    bancoId = (bancoExistente as { id: string }).id;
  } else {
    const { data: insertado, error: insBancoErr } = await supabase
      .from('bancos')
      .insert({ nombre: bancoTrim, nombre_normalizado: bancoNorm, auth_user_id: uid })
      .select('id')
      .maybeSingle();

    if (insBancoErr?.code === '23505') {
      const { data: otraVez } = await supabase
        .from('bancos')
        .select('id')
        .eq('auth_user_id', uid)
        .eq('nombre_normalizado', bancoNorm)
        .maybeSingle();
      if (otraVez && typeof (otraVez as { id: unknown }).id === 'string') {
        bancoId = (otraVez as { id: string }).id;
      } else {
        return { ok: false, banco, nombre, tipo, error: 'No se pudo resolver el banco tras conflicto.' };
      }
    } else if (insBancoErr || !insertado) {
      return {
        ok: false,
        banco,
        nombre,
        tipo,
        error: insBancoErr?.message ?? 'No se pudo crear el banco.',
      };
    } else {
      bancoId = (insertado as { id: string }).id;
    }
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
    return {
      ok: false,
      banco: bancoTrim,
      nombre: nombreTrim,
      tipo: tipoTrim,
      error: cuentaErr.message || 'No se pudo crear la cuenta.',
    };
  }

  return {
    ok: true,
    banco: bancoTrim,
    nombre: nombreTrim,
    tipo: tipoTrim,
    cuenta_id: (cuentaRow as { id: string }).id,
  };
}
