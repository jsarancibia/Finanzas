-- Fix: ahorro sin origen explícito debe reducir saldo_disponible_sin_cuenta.
-- Revert de ahorro sin origen debe restaurarlo.

CREATE OR REPLACE FUNCTION public.aplicar_movimiento(
  p_auth_user_id uuid,
  p_tipo text,
  p_monto numeric,
  p_categoria text,
  p_descripcion text,
  p_origen text,
  p_destino text,
  p_banco text,
  p_cuenta_producto text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo public.movimiento_tipo;
  v_ctid tid;
  v_saldo_disp numeric;
  v_saldo_ahor numeric;
  v_sin_cuenta numeric;
  new_id uuid;
  v_banco_id uuid;
  v_cuenta_id uuid;
  v_banco_norm text;
  v_cuenta_norm text;
  v_cuenta_tipo public.cuenta_tipo;
  v_banco_trim text;
  v_cuenta_trim text;
  v_orch text;
  v_origen_cuenta_id uuid;
  v_origen_saldo numeric;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_usuario');
  END IF;

  IF p_tipo IS NULL OR lower(trim(p_tipo)) NOT IN ('ingreso', 'gasto', 'ahorro') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  v_tipo := lower(trim(p_tipo))::public.movimiento_tipo;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monto_invalido');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.movimientos m
    WHERE m.auth_user_id = p_auth_user_id
      AND m.tipo = v_tipo
      AND m.monto = p_monto
      AND lower(trim(coalesce(m.descripcion, ''))) = lower(trim(coalesce(p_descripcion, '')))
      AND m.fecha > now() - interval '10 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.balances WHERE auth_user_id = p_auth_user_id) THEN
    INSERT INTO public.balances (saldo_disponible, saldo_ahorrado, saldo_disponible_sin_cuenta, ultima_actualizacion, auth_user_id)
    VALUES (0, 0, 0, now(), p_auth_user_id);
  END IF;

  SELECT b.ctid, b.saldo_disponible, b.saldo_ahorrado, coalesce(b.saldo_disponible_sin_cuenta, 0)
  INTO v_ctid, v_saldo_disp, v_saldo_ahor, v_sin_cuenta
  FROM public.balances AS b
  WHERE b.auth_user_id = p_auth_user_id
  ORDER BY b.ultima_actualizacion DESC NULLS LAST, b.ctid DESC
  LIMIT 1
  FOR UPDATE;

  IF v_ctid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_fila_balances');
  END IF;

  IF v_tipo = 'gasto' AND v_saldo_disp < p_monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente');
  END IF;

  IF v_tipo = 'ahorro' AND v_saldo_disp < p_monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente');
  END IF;

  v_banco_trim := nullif(trim(coalesce(p_banco, '')), '');
  v_cuenta_trim := nullif(trim(coalesce(p_cuenta_producto, '')), '');
  v_banco_id := NULL;
  v_cuenta_id := NULL;
  v_origen_cuenta_id := NULL;

  IF v_banco_trim IS NOT NULL AND v_cuenta_trim IS NOT NULL THEN
    v_banco_norm := lower(regexp_replace(v_banco_trim, '\s+', ' ', 'g'));
    v_cuenta_norm := lower(regexp_replace(v_cuenta_trim, '\s+', ' ', 'g'));

    INSERT INTO public.bancos (nombre, nombre_normalizado, auth_user_id)
    VALUES (v_banco_trim, v_banco_norm, p_auth_user_id)
    ON CONFLICT (auth_user_id, nombre_normalizado) DO NOTHING;

    SELECT id INTO v_banco_id
    FROM public.bancos
    WHERE nombre_normalizado = v_banco_norm AND auth_user_id = p_auth_user_id
    LIMIT 1;

    SELECT c.id
    INTO v_cuenta_id
    FROM public.cuentas c
    WHERE c.auth_user_id = p_auth_user_id
      AND c.banco_id = v_banco_id
      AND lower(regexp_replace(trim(c.nombre), '\s+', ' ', 'g')) = v_cuenta_norm
    LIMIT 1;

    IF v_cuenta_id IS NULL THEN
      IF v_tipo = 'ingreso'::public.movimiento_tipo THEN
        v_cuenta_tipo := 'disponible'::public.cuenta_tipo;
      ELSIF v_tipo = 'gasto'::public.movimiento_tipo THEN
        v_cuenta_tipo := 'disponible'::public.cuenta_tipo;
      ELSIF v_cuenta_trim ~* '(fondo|mutuo|invers|fpv|apv|accion|etf)' THEN
        v_cuenta_tipo := 'inversion'::public.cuenta_tipo;
      ELSE
        v_cuenta_tipo := 'ahorro'::public.cuenta_tipo;
      END IF;

      INSERT INTO public.cuentas (nombre, banco_id, tipo, saldo, auth_user_id)
      VALUES (v_cuenta_trim, v_banco_id, v_cuenta_tipo, 0, p_auth_user_id)
      RETURNING id INTO v_cuenta_id;
    END IF;
  END IF;

  IF v_tipo = 'ahorro'::public.movimiento_tipo
     AND nullif(trim(coalesce(p_origen, '')), '') IS NOT NULL
  THEN
    v_orch := trim(p_origen);
    v_origen_cuenta_id := public.resolver_cuenta_disponible_desde_origen(v_orch, p_auth_user_id);
    IF v_origen_cuenta_id IS NULL THEN
      IF position(chr(183) in v_orch) > 0 OR position(' - ' in v_orch) > 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'origen_disponible_no_encontrado');
      END IF;
    ELSE
      IF v_cuenta_id IS NOT NULL AND v_origen_cuenta_id = v_cuenta_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'origen_igual_destino');
      END IF;
      SELECT c.saldo INTO v_origen_saldo FROM public.cuentas c WHERE c.id = v_origen_cuenta_id AND c.auth_user_id = p_auth_user_id;
      IF v_origen_saldo IS NULL OR v_origen_saldo < p_monto THEN
        RETURN jsonb_build_object('ok', false, 'error', 'saldo_insuficiente_cuenta_origen');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.movimientos (
    tipo, monto, categoria, descripcion, origen, destino, cuenta_id, auth_user_id
  )
  VALUES (
    v_tipo,
    p_monto,
    coalesce(nullif(trim(p_categoria), ''), ''),
    coalesce(nullif(trim(p_descripcion), ''), ''),
    nullif(trim(p_origen), ''),
    nullif(trim(p_destino), ''),
    v_cuenta_id,
    p_auth_user_id
  )
  RETURNING id INTO new_id;

  IF v_tipo = 'ingreso' THEN
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible + p_monto,
      saldo_disponible_sin_cuenta = CASE
        WHEN v_cuenta_id IS NULL THEN saldo_disponible_sin_cuenta + p_monto
        ELSE saldo_disponible_sin_cuenta
      END,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
  ELSIF v_tipo = 'gasto' THEN
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible - p_monto,
      saldo_disponible_sin_cuenta = CASE
        WHEN v_cuenta_id IS NULL THEN saldo_disponible_sin_cuenta - LEAST(p_monto, saldo_disponible_sin_cuenta)
        ELSE saldo_disponible_sin_cuenta
      END,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
  ELSIF v_tipo = 'ahorro' THEN
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible - p_monto,
      saldo_ahorrado = saldo_ahorrado + p_monto,
      saldo_disponible_sin_cuenta = CASE
        WHEN v_origen_cuenta_id IS NULL
          THEN saldo_disponible_sin_cuenta - LEAST(p_monto, saldo_disponible_sin_cuenta)
        ELSE saldo_disponible_sin_cuenta
      END,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
  END IF;

  IF v_cuenta_id IS NOT NULL THEN
    IF v_tipo = 'ingreso'::public.movimiento_tipo THEN
      UPDATE public.cuentas SET saldo = saldo + p_monto WHERE id = v_cuenta_id AND auth_user_id = p_auth_user_id;
    ELSIF v_tipo = 'gasto'::public.movimiento_tipo THEN
      UPDATE public.cuentas SET saldo = saldo - p_monto WHERE id = v_cuenta_id AND auth_user_id = p_auth_user_id;
    ELSIF v_tipo = 'ahorro'::public.movimiento_tipo THEN
      UPDATE public.cuentas SET saldo = saldo + p_monto WHERE id = v_cuenta_id AND auth_user_id = p_auth_user_id;
    END IF;
  END IF;

  IF v_origen_cuenta_id IS NOT NULL THEN
    UPDATE public.cuentas SET saldo = saldo - p_monto WHERE id = v_origen_cuenta_id AND auth_user_id = p_auth_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'movimiento_id', new_id);
END;
$$;

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
    SELECT id, tipo, monto, categoria, cuenta_id, origen
    INTO m
    FROM public.movimientos
    WHERE auth_user_id = p_auth_user_id AND monto = p_monto_filtro
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

  IF m.tipo = 'gasto'::public.movimiento_tipo AND m.cuenta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gasto_sin_cuenta_no_reversible');
  END IF;

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

  IF m.tipo = 'gasto'::public.movimiento_tipo THEN
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible + m.monto,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
    UPDATE public.cuentas SET saldo = saldo + m.monto WHERE id = m.cuenta_id AND auth_user_id = p_auth_user_id;
    DELETE FROM public.movimientos WHERE id = mid AND auth_user_id = p_auth_user_id;
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
      saldo_disponible_sin_cuenta = CASE
        WHEN nullif(trim(coalesce(m.origen, '')), '') IS NULL
          THEN LEAST(saldo_disponible_sin_cuenta + m.monto, saldo_disponible + m.monto)
        ELSE saldo_disponible_sin_cuenta
      END,
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

REVOKE ALL ON FUNCTION public.aplicar_movimiento(uuid, text, numeric, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aplicar_movimiento(uuid, text, numeric, text, text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.revertir_ultimo_movimiento(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revertir_ultimo_movimiento(uuid, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
