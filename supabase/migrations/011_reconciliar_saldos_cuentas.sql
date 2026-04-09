-- Recalcula `cuentas.saldo` desde `movimientos` y alinea con la fila canónica de `balances`
-- (disponible total + sin cuenta; ahorro/inversión total). Útil tras traspasos, ahorros con/sin
-- origen explícito en el historial, o datos viejos desfasados.

CREATE OR REPLACE FUNCTION public.resolver_cuenta_disponible_desde_origen(p_origen text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_orch text;
  v_obanco_trim text;
  v_ocuenta_trim text;
  v_obanco_id uuid;
  v_obanco_norm text;
  v_ocuenta_norm text;
  v_cid uuid;
BEGIN
  v_orch := nullif(trim(coalesce(p_origen, '')), '');
  IF v_orch IS NULL THEN
    RETURN NULL;
  END IF;

  v_obanco_trim := nullif(trim(split_part(v_orch, chr(183), 1)), '');
  v_ocuenta_trim := nullif(trim(split_part(v_orch, chr(183), 2)), '');
  IF v_ocuenta_trim IS NULL OR length(v_ocuenta_trim) = 0 THEN
    v_obanco_trim := nullif(trim(split_part(v_orch, ' - ', 1)), '');
    v_ocuenta_trim := nullif(trim(split_part(v_orch, ' - ', 2)), '');
  END IF;
  IF v_obanco_trim IS NULL OR v_ocuenta_trim IS NULL OR length(v_ocuenta_trim) = 0 THEN
    RETURN NULL;
  END IF;

  v_obanco_norm := lower(regexp_replace(v_obanco_trim, '\s+', ' ', 'g'));
  v_ocuenta_norm := lower(regexp_replace(v_ocuenta_trim, '\s+', ' ', 'g'));

  SELECT id INTO v_obanco_id FROM public.bancos WHERE nombre_normalizado = v_obanco_norm LIMIT 1;
  IF v_obanco_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.id
  INTO v_cid
  FROM public.cuentas c
  WHERE c.banco_id = v_obanco_id
    AND lower(regexp_replace(trim(c.nombre), '\s+', ' ', 'g')) = v_ocuenta_norm
    AND c.tipo = 'disponible'::public.cuenta_tipo
  LIMIT 1;

  RETURN v_cid;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconciliar_saldos_cuentas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctid tid;
  v_saldo_disp numeric;
  v_saldo_ahor numeric;
  v_sin_cuenta numeric;
  v_sum_d numeric;
  v_sum_a numeric;
  v_diff numeric;
  v_max_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.balances LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_balances');
  END IF;

  SELECT b.ctid, b.saldo_disponible, b.saldo_ahorrado, coalesce(b.saldo_disponible_sin_cuenta, 0)
  INTO v_ctid, v_saldo_disp, v_saldo_ahor, v_sin_cuenta
  FROM public.balances AS b
  ORDER BY b.ultima_actualizacion DESC NULLS LAST, b.ctid DESC
  LIMIT 1
  FOR UPDATE;

  IF v_ctid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_fila_balances');
  END IF;

  UPDATE public.cuentas SET saldo = 0;

  UPDATE public.cuentas c
  SET saldo = c.saldo + x.s
  FROM (
    SELECT cuenta_id, SUM(monto) AS s
    FROM public.movimientos
    WHERE tipo = 'ingreso'::public.movimiento_tipo AND cuenta_id IS NOT NULL
    GROUP BY cuenta_id
  ) x
  WHERE c.id = x.cuenta_id;

  UPDATE public.cuentas c
  SET saldo = c.saldo - x.s
  FROM (
    SELECT cuenta_id, SUM(monto) AS s
    FROM public.movimientos
    WHERE tipo = 'gasto'::public.movimiento_tipo AND cuenta_id IS NOT NULL
    GROUP BY cuenta_id
  ) x
  WHERE c.id = x.cuenta_id;

  UPDATE public.cuentas c
  SET saldo = c.saldo + x.s
  FROM (
    SELECT cuenta_id, SUM(monto) AS s
    FROM public.movimientos
    WHERE tipo = 'ahorro'::public.movimiento_tipo AND cuenta_id IS NOT NULL
    GROUP BY cuenta_id
  ) x
  WHERE c.id = x.cuenta_id;

  UPDATE public.cuentas c
  SET saldo = c.saldo - a.s
  FROM (
    SELECT d.cid, SUM(d.monto) AS s
    FROM (
      SELECT
        m.monto,
        public.resolver_cuenta_disponible_desde_origen(NULLIF(TRIM(m.origen), '')) AS cid
      FROM public.movimientos m
      WHERE m.tipo = 'ahorro'::public.movimiento_tipo
        AND NULLIF(TRIM(m.origen), '') IS NOT NULL
    ) d
    WHERE d.cid IS NOT NULL
    GROUP BY d.cid
  ) a
  WHERE c.id = a.cid;

  UPDATE public.cuentas SET saldo = GREATEST(0, saldo) WHERE saldo < 0;

  SELECT COALESCE(SUM(saldo), 0) INTO v_sum_d FROM public.cuentas WHERE tipo = 'disponible'::public.cuenta_tipo;

  IF v_sum_d > v_saldo_disp + 0.0001 THEN
    UPDATE public.cuentas c
    SET saldo = round(c.saldo * v_saldo_disp / v_sum_d, 0)
    WHERE c.tipo = 'disponible'::public.cuenta_tipo;
    SELECT COALESCE(SUM(saldo), 0) INTO v_sum_d FROM public.cuentas WHERE tipo = 'disponible'::public.cuenta_tipo;
    v_diff := v_saldo_disp - v_sum_d;
    IF abs(v_diff) > 0.0001 THEN
      SELECT c.id
      INTO v_max_id
      FROM public.cuentas c
      WHERE c.tipo = 'disponible'::public.cuenta_tipo
      ORDER BY c.saldo DESC NULLS LAST, c.id
      LIMIT 1;
      IF v_max_id IS NOT NULL THEN
        UPDATE public.cuentas SET saldo = saldo + v_diff WHERE id = v_max_id;
      END IF;
    END IF;
    SELECT COALESCE(SUM(saldo), 0) INTO v_sum_d FROM public.cuentas WHERE tipo = 'disponible'::public.cuenta_tipo;
  END IF;

  UPDATE public.balances
  SET
    saldo_disponible_sin_cuenta = GREATEST(0, v_saldo_disp - v_sum_d),
    ultima_actualizacion = now()
  WHERE ctid = v_ctid;

  SELECT COALESCE(SUM(saldo), 0) INTO v_sum_a
  FROM public.cuentas
  WHERE tipo IN ('ahorro', 'inversion');

  IF v_sum_a > 0 AND abs(v_sum_a - v_saldo_ahor) > 0.0001 THEN
    UPDATE public.cuentas c
    SET saldo = round(c.saldo * v_saldo_ahor / v_sum_a, 0)
    WHERE c.tipo IN ('ahorro', 'inversion');
    SELECT COALESCE(SUM(saldo), 0) INTO v_sum_a
    FROM public.cuentas
    WHERE tipo IN ('ahorro', 'inversion');
    v_diff := v_saldo_ahor - v_sum_a;
    IF abs(v_diff) > 0.0001 THEN
      SELECT c.id
      INTO v_max_id
      FROM public.cuentas c
      WHERE c.tipo IN ('ahorro', 'inversion')
      ORDER BY c.saldo DESC NULLS LAST, c.id
      LIMIT 1;
      IF v_max_id IS NOT NULL THEN
        UPDATE public.cuentas SET saldo = saldo + v_diff WHERE id = v_max_id;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(SUM(saldo), 0) INTO v_sum_d FROM public.cuentas WHERE tipo = 'disponible'::public.cuenta_tipo;
  SELECT COALESCE(SUM(saldo), 0) INTO v_sum_a
  FROM public.cuentas
  WHERE tipo IN ('ahorro', 'inversion');

  RETURN jsonb_build_object(
    'ok', true,
    'saldo_disponible_balance', v_saldo_disp,
    'suma_cuentas_disponible', v_sum_d,
    'saldo_disponible_sin_cuenta', GREATEST(0, v_saldo_disp - v_sum_d),
    'saldo_ahorrado_balance', v_saldo_ahor,
    'suma_cuentas_ahorro_inversion', v_sum_a
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_cuenta_disponible_desde_origen(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_cuenta_disponible_desde_origen(text) TO service_role;

REVOKE ALL ON FUNCTION public.reconciliar_saldos_cuentas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconciliar_saldos_cuentas() TO service_role;

NOTIFY pgrst, 'reload schema';
