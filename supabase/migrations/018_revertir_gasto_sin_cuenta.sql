-- Permite revertir gastos sin cuenta_id: devuelve monto a saldo_disponible.
-- Antes se rechazaba con 'gasto_sin_cuenta_no_reversible'.

CREATE OR REPLACE FUNCTION public.revertir_ultimo_movimiento(
  p_auth_user_id uuid,
  p_monto_filtro numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  v_ctid tid;
  mid uuid;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_usuario');
  END IF;

  IF p_monto_filtro IS NOT NULL AND p_monto_filtro > 0 THEN
    SELECT id, tipo, monto, categoria, cuenta_id
    INTO m
    FROM public.movimientos
    WHERE auth_user_id = p_auth_user_id AND monto = p_monto_filtro
    ORDER BY fecha DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sin_movimiento_con_ese_monto');
    END IF;
  ELSE
    SELECT id, tipo, monto, categoria, cuenta_id
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

  IF NOT EXISTS (SELECT 1 FROM public.balances WHERE auth_user_id = p_auth_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_balances');
  END IF;

  SELECT b.ctid
  INTO v_ctid
  FROM public.balances AS b
  WHERE b.auth_user_id = p_auth_user_id
  ORDER BY b.ultima_actualizacion DESC NULLS LAST, b.ctid DESC
  LIMIT 1
  FOR UPDATE;

  IF v_ctid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_fila_balances');
  END IF;

  -- Asignación desde colchón (ingreso con categoría especial)
  IF m.tipo = 'ingreso'::public.movimiento_tipo
     AND lower(trim(coalesce(m.categoria, ''))) = 'asignacion_sin_cuenta' THEN
    IF m.cuenta_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'asignacion_datos_invalidos');
    END IF;
    UPDATE public.balances
    SET
      saldo_disponible_sin_cuenta = saldo_disponible_sin_cuenta + m.monto,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    UPDATE public.cuentas SET saldo = saldo - m.monto WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    DELETE FROM public.movimientos WHERE id = mid AND auth_user_id = p_auth_user_id;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'revertido', 'asignacion_sin_cuenta');
  END IF;

  -- Ingreso
  IF m.tipo = 'ingreso'::public.movimiento_tipo THEN
    IF m.cuenta_id IS NULL THEN
      IF (SELECT coalesce(saldo_disponible_sin_cuenta, 0) FROM public.balances b WHERE b.ctid = v_ctid) < m.monto THEN
        RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente_para_revertir');
      END IF;
      UPDATE public.balances
      SET
        saldo_disponible = saldo_disponible - m.monto,
        saldo_disponible_sin_cuenta = saldo_disponible_sin_cuenta - m.monto,
        ultima_actualizacion = now()
      WHERE ctid = v_ctid;
    ELSE
      IF (SELECT saldo_disponible FROM public.balances b WHERE b.ctid = v_ctid) < m.monto THEN
        RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente_para_revertir');
      END IF;
      UPDATE public.balances
      SET
        saldo_disponible = saldo_disponible - m.monto,
        ultima_actualizacion = now()
      WHERE ctid = v_ctid;
      UPDATE public.cuentas SET saldo = saldo - m.monto WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    END IF;
    DELETE FROM public.movimientos WHERE id = mid AND auth_user_id = p_auth_user_id;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'revertido', 'ingreso');
  END IF;

  -- Gasto (con o sin cuenta)
  IF m.tipo = 'gasto'::public.movimiento_tipo THEN
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible + m.monto,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    IF m.cuenta_id IS NOT NULL THEN
      UPDATE public.cuentas SET saldo = saldo + m.monto WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    END IF;
    DELETE FROM public.movimientos WHERE id = mid AND auth_user_id = p_auth_user_id;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'revertido', 'gasto');
  END IF;

  -- Ahorro
  IF m.tipo = 'ahorro'::public.movimiento_tipo THEN
    IF (SELECT saldo_ahorrado FROM public.balances b WHERE b.ctid = v_ctid) < m.monto THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ahorro_insuficiente_para_revertir');
    END IF;
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible + m.monto,
      saldo_ahorrado = saldo_ahorrado - m.monto,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    IF m.cuenta_id IS NOT NULL THEN
      UPDATE public.cuentas SET saldo = saldo - m.monto WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    END IF;
    DELETE FROM public.movimientos WHERE id = mid AND auth_user_id = p_auth_user_id;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'revertido', 'ahorro');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'tipo_no_soportado');
END;
$$;

REVOKE ALL ON FUNCTION public.revertir_ultimo_movimiento(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revertir_ultimo_movimiento(uuid, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
