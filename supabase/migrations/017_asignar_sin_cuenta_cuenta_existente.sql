-- Reparto desde colchón: reutiliza cuenta existente (disponible / ahorro / inversión)
-- y crea nuevas como inversión si el nombre sugiere fondo mutuo, APV, etc. (alineado a aplicar_movimiento).

CREATE OR REPLACE FUNCTION public.asignar_desde_disponible_sin_cuenta(
  p_auth_user_id uuid,
  p_monto numeric,
  p_banco text,
  p_cuenta_producto text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctid tid;
  v_sin_cuenta numeric;
  v_banco_id uuid;
  v_cuenta_id uuid;
  v_banco_norm text;
  v_cuenta_norm text;
  v_banco_trim text;
  v_cuenta_trim text;
  v_nueva_tipo public.cuenta_tipo;
  new_id uuid;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_usuario');
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monto_invalido');
  END IF;

  v_banco_trim := nullif(trim(coalesce(p_banco, '')), '');
  v_cuenta_trim := nullif(trim(coalesce(p_cuenta_producto, '')), '');
  IF v_banco_trim IS NULL OR v_cuenta_trim IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cuenta_requerida');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.movimientos m
    WHERE m.auth_user_id = p_auth_user_id
      AND m.tipo = 'ingreso'::public.movimiento_tipo
      AND m.monto = p_monto
      AND coalesce(m.categoria, '') = 'asignacion_sin_cuenta'
      AND m.fecha > now() - interval '10 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.balances WHERE auth_user_id = p_auth_user_id) THEN
    INSERT INTO public.balances (saldo_disponible, saldo_ahorrado, saldo_disponible_sin_cuenta, ultima_actualizacion, auth_user_id)
    VALUES (0, 0, 0, now(), p_auth_user_id);
  END IF;

  SELECT b.ctid, coalesce(b.saldo_disponible_sin_cuenta, 0)
  INTO v_ctid, v_sin_cuenta
  FROM public.balances AS b
  WHERE b.auth_user_id = p_auth_user_id
  ORDER BY b.ultima_actualizacion DESC NULLS LAST, b.ctid DESC
  LIMIT 1
  FOR UPDATE;

  IF v_ctid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_fila_balances');
  END IF;

  IF v_sin_cuenta < p_monto THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cuenta_insuficiente');
  END IF;

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
  ORDER BY CASE c.tipo
    WHEN 'inversion'::public.cuenta_tipo THEN 0
    WHEN 'ahorro'::public.cuenta_tipo THEN 1
    WHEN 'disponible'::public.cuenta_tipo THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF v_cuenta_id IS NULL THEN
    IF v_cuenta_trim ~* '(fondo|mutuo|invers|fpv|apv|accion|etf)' THEN
      v_nueva_tipo := 'inversion'::public.cuenta_tipo;
    ELSE
      v_nueva_tipo := 'disponible'::public.cuenta_tipo;
    END IF;
    INSERT INTO public.cuentas (nombre, banco_id, tipo, saldo, auth_user_id)
    VALUES (v_cuenta_trim, v_banco_id, v_nueva_tipo, 0, p_auth_user_id)
    RETURNING id INTO v_cuenta_id;
  END IF;

  UPDATE public.balances
  SET
    saldo_disponible_sin_cuenta = saldo_disponible_sin_cuenta - p_monto,
    ultima_actualizacion = now()
  WHERE ctid = v_ctid;

  UPDATE public.cuentas SET saldo = saldo + p_monto WHERE id = v_cuenta_id AND auth_user_id = p_auth_user_id;

  INSERT INTO public.movimientos (
    tipo,
    monto,
    categoria,
    descripcion,
    origen,
    destino,
    cuenta_id,
    auth_user_id
  )
  VALUES (
    'ingreso'::public.movimiento_tipo,
    p_monto,
    'asignacion_sin_cuenta',
    'Desde disponible sin cuenta',
    '',
    v_banco_trim || ' · ' || v_cuenta_trim,
    v_cuenta_id,
    p_auth_user_id
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimiento_id', new_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_desde_disponible_sin_cuenta(uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_desde_disponible_sin_cuenta(uuid, numeric, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
