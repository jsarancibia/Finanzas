-- Migración 020: corregir_monto_ultimo_movimiento incluye origen en SELECT
-- y ajusta saldo_disponible_sin_cuenta cuando se corrige un ahorro sin cuenta explícita de origen.
-- Cubre el descuadre detectado en la revisión: 019 ajustó aplicar+revertir pero no corregir.

CREATE OR REPLACE FUNCTION public.corregir_monto_ultimo_movimiento(
  p_auth_user_id uuid,
  p_monto_anterior numeric DEFAULT NULL,
  p_monto_nuevo numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  v_ctid tid;
  d numeric;
  mid uuid;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_usuario');
  END IF;

  IF p_monto_nuevo IS NULL OR p_monto_nuevo <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monto_invalido');
  END IF;

  -- Ahora incluye `origen` para detectar ahorro sin cuenta explícita
  IF p_monto_anterior IS NOT NULL AND p_monto_anterior > 0 THEN
    SELECT id, tipo, monto, categoria, cuenta_id, origen
    INTO m
    FROM public.movimientos
    WHERE auth_user_id = p_auth_user_id AND monto = p_monto_anterior
    ORDER BY fecha DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sin_movimiento_con_ese_monto');
    END IF;
  ELSE
    SELECT id, tipo, monto, categoria, cuenta_id, origen
    INTO m
    FROM public.movimientos
    WHERE auth_user_id = p_auth_user_id
    ORDER BY fecha DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sin_movimientos');
    END IF;
  END IF;

  mid := m.id;
  d := p_monto_nuevo - m.monto;
  IF d = 0 THEN
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'mensaje', 'sin_cambio');
  END IF;

  IF m.tipo = 'gasto'::public.movimiento_tipo AND m.cuenta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gasto_sin_cuenta_no_reversible');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.balances WHERE auth_user_id = p_auth_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_balances');
  END IF;

  SELECT b.ctid INTO v_ctid
  FROM public.balances AS b
  WHERE b.auth_user_id = p_auth_user_id
  ORDER BY b.ultima_actualizacion DESC NULLS LAST, b.ctid DESC
  LIMIT 1
  FOR UPDATE;

  IF v_ctid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_fila_balances');
  END IF;

  -- Corrección de asignación desde pool sin cuenta
  IF m.tipo = 'ingreso'::public.movimiento_tipo
     AND lower(trim(coalesce(m.categoria, ''))) = 'asignacion_sin_cuenta' THEN
    IF m.cuenta_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'asignacion_datos_invalidos');
    END IF;
    IF d > 0 AND (SELECT coalesce(saldo_disponible_sin_cuenta, 0) FROM public.balances b WHERE b.ctid = v_ctid) < d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sin_cuenta_insuficiente');
    END IF;
    IF d < 0 AND (SELECT saldo FROM public.cuentas c WHERE c.id = m.cuenta_id AND c.auth_user_id = p_auth_user_id) < -d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cuenta_insuficiente');
    END IF;
    UPDATE public.balances
    SET
      saldo_disponible_sin_cuenta = saldo_disponible_sin_cuenta - d,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    UPDATE public.cuentas SET saldo = saldo + d WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    UPDATE public.movimientos SET monto = p_monto_nuevo WHERE id = mid AND auth_user_id = p_auth_user_id;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'corregido', 'asignacion_sin_cuenta');
  END IF;

  -- Corrección de ingreso simple
  IF m.tipo = 'ingreso'::public.movimiento_tipo THEN
    IF m.cuenta_id IS NULL THEN
      IF d < 0 AND (SELECT saldo_disponible FROM public.balances b WHERE b.ctid = v_ctid) < -d THEN
        RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente_para_revertir');
      END IF;
      IF d < 0 AND (SELECT coalesce(saldo_disponible_sin_cuenta, 0) FROM public.balances b WHERE b.ctid = v_ctid) < -d THEN
        RETURN jsonb_build_object('ok', false, 'error', 'sin_cuenta_insuficiente');
      END IF;
      UPDATE public.balances
      SET
        saldo_disponible = saldo_disponible + d,
        saldo_disponible_sin_cuenta = saldo_disponible_sin_cuenta + d,
        ultima_actualizacion = now()
      WHERE ctid = v_ctid;
    ELSE
      IF d < 0 AND (SELECT saldo_disponible FROM public.balances b WHERE b.ctid = v_ctid) < -d THEN
        RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente_para_revertir');
      END IF;
      IF d < 0 AND (SELECT saldo FROM public.cuentas c WHERE c.id = m.cuenta_id AND c.auth_user_id = p_auth_user_id) < -d THEN
        RETURN jsonb_build_object('ok', false, 'error', 'cuenta_insuficiente');
      END IF;
      UPDATE public.balances
      SET
        saldo_disponible = saldo_disponible + d,
        ultima_actualizacion = now()
      WHERE ctid = v_ctid;
      UPDATE public.cuentas SET saldo = saldo + d WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    END IF;
    UPDATE public.movimientos SET monto = p_monto_nuevo WHERE id = mid AND auth_user_id = p_auth_user_id;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'corregido', 'ingreso');
  END IF;

  -- Corrección de gasto (con cuenta)
  IF m.tipo = 'gasto'::public.movimiento_tipo THEN
    IF d > 0 AND (SELECT saldo_disponible FROM public.balances b WHERE b.ctid = v_ctid) < d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente');
    END IF;
    IF d < 0 AND (SELECT saldo FROM public.cuentas c WHERE c.id = m.cuenta_id AND c.auth_user_id = p_auth_user_id) < -d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cuenta_insuficiente');
    END IF;
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible - d,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    UPDATE public.cuentas SET saldo = saldo - d WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    UPDATE public.movimientos SET monto = p_monto_nuevo WHERE id = mid AND auth_user_id = p_auth_user_id;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'corregido', 'gasto');
  END IF;

  -- Corrección de ahorro — NUEVO: ajusta saldo_disponible_sin_cuenta si no hay origen explícito
  IF m.tipo = 'ahorro'::public.movimiento_tipo THEN
    IF d > 0 AND (SELECT saldo_disponible FROM public.balances b WHERE b.ctid = v_ctid) < d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente');
    END IF;
    IF d < 0 AND (SELECT saldo_ahorrado FROM public.balances b WHERE b.ctid = v_ctid) < -d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ahorro_insuficiente_para_revertir');
    END IF;
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible - d,
      saldo_ahorrado = saldo_ahorrado + d,
      -- Si el ahorro no tiene cuenta de origen explícita (viene del pool sin cuenta), ajustar el colchón
      saldo_disponible_sin_cuenta = CASE
        WHEN nullif(trim(coalesce(m.origen, '')), '') IS NULL THEN
          CASE
            WHEN d > 0 THEN GREATEST(0, saldo_disponible_sin_cuenta - d)
            ELSE LEAST(saldo_disponible_sin_cuenta - d, saldo_disponible - d)
          END
        ELSE saldo_disponible_sin_cuenta
      END,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    IF m.cuenta_id IS NOT NULL THEN
      IF d < 0 AND (SELECT saldo FROM public.cuentas c WHERE c.id = m.cuenta_id AND c.auth_user_id = p_auth_user_id) < -d THEN
        RETURN jsonb_build_object('ok', false, 'error', 'cuenta_insuficiente');
      END IF;
      UPDATE public.cuentas SET saldo = saldo + d WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    END IF;
    UPDATE public.movimientos SET monto = p_monto_nuevo WHERE id = mid AND auth_user_id = p_auth_user_id;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'corregido', 'ahorro');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'tipo_no_manejado');
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_monto_ultimo_movimiento(uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corregir_monto_ultimo_movimiento(uuid, numeric, numeric) TO service_role;
