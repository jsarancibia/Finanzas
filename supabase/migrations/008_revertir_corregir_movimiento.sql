-- Revertir último movimiento (o el más reciente con un monto dado) y corregir monto del último / por monto anterior.
-- Requiere columna saldo_disponible_sin_cuenta (migración 006). Idempotente si ya existe.

ALTER TABLE public.balances
  ADD COLUMN IF NOT EXISTS saldo_disponible_sin_cuenta numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.revertir_ultimo_movimiento(p_monto_filtro numeric DEFAULT NULL)
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
  IF p_monto_filtro IS NOT NULL AND p_monto_filtro > 0 THEN
    SELECT id, tipo, monto, categoria, cuenta_id
    INTO m
    FROM public.movimientos
    WHERE monto = p_monto_filtro
    ORDER BY fecha DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sin_movimiento_con_ese_monto');
    END IF;
  ELSE
    SELECT id, tipo, monto, categoria, cuenta_id
    INTO m
    FROM public.movimientos
    ORDER BY fecha DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sin_movimientos');
    END IF;
  END IF;

  mid := m.id;

  IF NOT EXISTS (SELECT 1 FROM public.balances LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_balances');
  END IF;

  SELECT b.ctid
  INTO v_ctid
  FROM public.balances AS b
  ORDER BY b.ultima_actualizacion DESC NULLS LAST, b.ctid DESC
  LIMIT 1
  FOR UPDATE;

  IF v_ctid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_fila_balances');
  END IF;

  -- Asignación desde disponible sin cuenta → ingreso con categoría fija
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
    UPDATE public.cuentas SET saldo = saldo - m.monto WHERE id = m.cuenta_id;
    DELETE FROM public.movimientos WHERE id = mid;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'revertido', 'asignacion_sin_cuenta');
  END IF;

  IF m.tipo = 'gasto'::public.movimiento_tipo AND m.cuenta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gasto_sin_cuenta_no_reversible');
  END IF;

  IF m.tipo = 'ingreso'::public.movimiento_tipo THEN
    IF m.cuenta_id IS NULL THEN
      IF (SELECT saldo_disponible FROM public.balances b WHERE b.ctid = v_ctid) < m.monto THEN
        RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente_para_revertir');
      END IF;
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
      UPDATE public.cuentas SET saldo = saldo - m.monto WHERE id = m.cuenta_id;
    END IF;
    DELETE FROM public.movimientos WHERE id = mid;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'revertido', 'ingreso');
  END IF;

  IF m.tipo = 'gasto'::public.movimiento_tipo THEN
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible + m.monto,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    UPDATE public.cuentas SET saldo = saldo + m.monto WHERE id = m.cuenta_id;
    DELETE FROM public.movimientos WHERE id = mid;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'revertido', 'gasto');
  END IF;

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
      UPDATE public.cuentas SET saldo = saldo - m.monto WHERE id = m.cuenta_id;
    END IF;
    DELETE FROM public.movimientos WHERE id = mid;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'revertido', 'ahorro');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'tipo_no_soportado');
END;
$$;

CREATE OR REPLACE FUNCTION public.corregir_monto_ultimo_movimiento(
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
  IF p_monto_nuevo IS NULL OR p_monto_nuevo <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monto_invalido');
  END IF;

  IF p_monto_anterior IS NOT NULL AND p_monto_anterior > 0 THEN
    SELECT id, tipo, monto, categoria, cuenta_id
    INTO m
    FROM public.movimientos
    WHERE monto = p_monto_anterior
    ORDER BY fecha DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sin_movimiento_con_ese_monto');
    END IF;
  ELSE
    SELECT id, tipo, monto, categoria, cuenta_id
    INTO m
    FROM public.movimientos
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

  IF NOT EXISTS (SELECT 1 FROM public.balances LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_balances');
  END IF;

  SELECT b.ctid INTO v_ctid
  FROM public.balances AS b
  ORDER BY b.ultima_actualizacion DESC NULLS LAST, b.ctid DESC
  LIMIT 1
  FOR UPDATE;

  IF v_ctid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_fila_balances');
  END IF;

  IF m.tipo = 'ingreso'::public.movimiento_tipo
     AND lower(trim(coalesce(m.categoria, ''))) = 'asignacion_sin_cuenta' THEN
    IF m.cuenta_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'asignacion_datos_invalidos');
    END IF;
    IF d > 0 AND (SELECT coalesce(saldo_disponible_sin_cuenta, 0) FROM public.balances b WHERE b.ctid = v_ctid) < d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sin_cuenta_insuficiente');
    END IF;
    IF d < 0 AND (SELECT saldo FROM public.cuentas c WHERE c.id = m.cuenta_id) < -d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cuenta_insuficiente');
    END IF;
    UPDATE public.balances
    SET
      saldo_disponible_sin_cuenta = saldo_disponible_sin_cuenta - d,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    UPDATE public.cuentas SET saldo = saldo + d WHERE id = m.cuenta_id;
    UPDATE public.movimientos SET monto = p_monto_nuevo WHERE id = mid;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'corregido', 'asignacion_sin_cuenta');
  END IF;

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
      IF d < 0 AND (SELECT saldo FROM public.cuentas c WHERE c.id = m.cuenta_id) < -d THEN
        RETURN jsonb_build_object('ok', false, 'error', 'cuenta_insuficiente');
      END IF;
      UPDATE public.balances
      SET
        saldo_disponible = saldo_disponible + d,
        ultima_actualizacion = now()
      WHERE ctid = v_ctid;
      UPDATE public.cuentas SET saldo = saldo + d WHERE id = m.cuenta_id;
    END IF;
    UPDATE public.movimientos SET monto = p_monto_nuevo WHERE id = mid;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'corregido', 'ingreso');
  END IF;

  IF m.tipo = 'gasto'::public.movimiento_tipo THEN
    IF d > 0 AND (SELECT saldo_disponible FROM public.balances b WHERE b.ctid = v_ctid) < d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente');
    END IF;
    IF d < 0 AND (SELECT saldo FROM public.cuentas c WHERE c.id = m.cuenta_id) < -d THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cuenta_insuficiente');
    END IF;
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible - d,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    UPDATE public.cuentas SET saldo = saldo - d WHERE id = m.cuenta_id;
    UPDATE public.movimientos SET monto = p_monto_nuevo WHERE id = mid;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'corregido', 'gasto');
  END IF;

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
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    IF m.cuenta_id IS NOT NULL THEN
      IF d < 0 AND (SELECT saldo FROM public.cuentas c WHERE c.id = m.cuenta_id) < -d THEN
        RETURN jsonb_build_object('ok', false, 'error', 'cuenta_insuficiente');
      END IF;
      UPDATE public.cuentas SET saldo = saldo + d WHERE id = m.cuenta_id;
    END IF;
    UPDATE public.movimientos SET monto = p_monto_nuevo WHERE id = mid;
    RETURN jsonb_build_object('ok', true, 'movimiento_id', mid, 'corregido', 'ahorro');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'tipo_no_soportado');
END;
$$;

REVOKE ALL ON FUNCTION public.revertir_ultimo_movimiento(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revertir_ultimo_movimiento(numeric) TO service_role;

REVOKE ALL ON FUNCTION public.corregir_monto_ultimo_movimiento(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corregir_monto_ultimo_movimiento(numeric, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
