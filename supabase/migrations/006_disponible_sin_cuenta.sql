-- Disponible sin cuenta: colchón no asignado a ninguna cuenta; asignación explícita a cuentas concretas.

ALTER TABLE public.balances
  ADD COLUMN IF NOT EXISTS saldo_disponible_sin_cuenta numeric NOT NULL DEFAULT 0;

UPDATE public.balances
SET saldo_disponible_sin_cuenta = 0
WHERE saldo_disponible_sin_cuenta IS NULL;

-- Ajusta aplicar_movimiento: ingreso sin cuenta_id suma también saldo_disponible_sin_cuenta;
-- gasto sin cuenta_id descuenta de ese colchón hasta agotarlo.
CREATE OR REPLACE FUNCTION public.aplicar_movimiento(
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
BEGIN
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
    WHERE m.tipo = v_tipo
      AND m.monto = p_monto
      AND lower(trim(coalesce(m.descripcion, ''))) = lower(trim(coalesce(p_descripcion, '')))
      AND m.fecha > now() - interval '10 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.balances LIMIT 1) THEN
    INSERT INTO public.balances (saldo_disponible, saldo_ahorrado, saldo_disponible_sin_cuenta, ultima_actualizacion)
    VALUES (0, 0, 0, now());
  END IF;

  SELECT b.ctid, b.saldo_disponible, b.saldo_ahorrado, coalesce(b.saldo_disponible_sin_cuenta, 0)
  INTO v_ctid, v_saldo_disp, v_saldo_ahor, v_sin_cuenta
  FROM public.balances AS b
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

  IF v_banco_trim IS NOT NULL AND v_cuenta_trim IS NOT NULL THEN
    v_banco_norm := lower(regexp_replace(v_banco_trim, '\s+', ' ', 'g'));
    v_cuenta_norm := lower(regexp_replace(v_cuenta_trim, '\s+', ' ', 'g'));

    INSERT INTO public.bancos (nombre, nombre_normalizado)
    VALUES (v_banco_trim, v_banco_norm)
    ON CONFLICT (nombre_normalizado) DO NOTHING;
    SELECT id INTO v_banco_id FROM public.bancos WHERE nombre_normalizado = v_banco_norm LIMIT 1;

    SELECT c.id
    INTO v_cuenta_id
    FROM public.cuentas c
    WHERE c.banco_id = v_banco_id
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

      INSERT INTO public.cuentas (nombre, banco_id, tipo, saldo)
      VALUES (v_cuenta_trim, v_banco_id, v_cuenta_tipo, 0)
      RETURNING id INTO v_cuenta_id;
    END IF;
  END IF;

  INSERT INTO public.movimientos (
    tipo,
    monto,
    categoria,
    descripcion,
    origen,
    destino,
    cuenta_id
  )
  VALUES (
    v_tipo,
    p_monto,
    coalesce(nullif(trim(p_categoria), ''), ''),
    coalesce(nullif(trim(p_descripcion), ''), ''),
    nullif(trim(p_origen), ''),
    nullif(trim(p_destino), ''),
    v_cuenta_id
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
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
  END IF;

  IF v_cuenta_id IS NOT NULL THEN
    IF v_tipo = 'ingreso'::public.movimiento_tipo THEN
      UPDATE public.cuentas SET saldo = saldo + p_monto WHERE id = v_cuenta_id;
    ELSIF v_tipo = 'gasto'::public.movimiento_tipo THEN
      UPDATE public.cuentas SET saldo = saldo - p_monto WHERE id = v_cuenta_id;
    ELSIF v_tipo = 'ahorro'::public.movimiento_tipo THEN
      UPDATE public.cuentas SET saldo = saldo + p_monto WHERE id = v_cuenta_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'movimiento_id', new_id
  );
END;
$$;

-- Pasa monto desde el colchón "sin cuenta" a una cuenta disponible (no cambia saldo_disponible total).
CREATE OR REPLACE FUNCTION public.asignar_desde_disponible_sin_cuenta(
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
  new_id uuid;
BEGIN
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
    WHERE m.tipo = 'ingreso'::public.movimiento_tipo
      AND m.monto = p_monto
      AND coalesce(m.categoria, '') = 'asignacion_sin_cuenta'
      AND m.fecha > now() - interval '10 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.balances LIMIT 1) THEN
    INSERT INTO public.balances (saldo_disponible, saldo_ahorrado, saldo_disponible_sin_cuenta, ultima_actualizacion)
    VALUES (0, 0, 0, now());
  END IF;

  SELECT b.ctid, coalesce(b.saldo_disponible_sin_cuenta, 0)
  INTO v_ctid, v_sin_cuenta
  FROM public.balances AS b
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

  INSERT INTO public.bancos (nombre, nombre_normalizado)
  VALUES (v_banco_trim, v_banco_norm)
  ON CONFLICT (nombre_normalizado) DO NOTHING;
  SELECT id INTO v_banco_id FROM public.bancos WHERE nombre_normalizado = v_banco_norm LIMIT 1;

  SELECT c.id
  INTO v_cuenta_id
  FROM public.cuentas c
  WHERE c.banco_id = v_banco_id
    AND lower(regexp_replace(trim(c.nombre), '\s+', ' ', 'g')) = v_cuenta_norm
    AND c.tipo = 'disponible'::public.cuenta_tipo
  LIMIT 1;

  IF v_cuenta_id IS NULL THEN
    INSERT INTO public.cuentas (nombre, banco_id, tipo, saldo)
    VALUES (v_cuenta_trim, v_banco_id, 'disponible'::public.cuenta_tipo, 0)
    RETURNING id INTO v_cuenta_id;
  END IF;

  UPDATE public.balances
  SET
    saldo_disponible_sin_cuenta = saldo_disponible_sin_cuenta - p_monto,
    ultima_actualizacion = now()
  WHERE ctid = v_ctid;

  UPDATE public.cuentas SET saldo = saldo + p_monto WHERE id = v_cuenta_id;

  INSERT INTO public.movimientos (
    tipo,
    monto,
    categoria,
    descripcion,
    origen,
    destino,
    cuenta_id
  )
  VALUES (
    'ingreso'::public.movimiento_tipo,
    p_monto,
    'asignacion_sin_cuenta',
    'Desde disponible sin cuenta',
    '',
    v_banco_trim || ' · ' || v_cuenta_trim,
    v_cuenta_id
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimiento_id', new_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_desde_disponible_sin_cuenta(numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_desde_disponible_sin_cuenta(numeric, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
