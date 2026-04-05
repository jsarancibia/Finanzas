-- LÓGICA DEL SISTEMA: escritura en BD + actualización de saldos en una transacción.
-- p_tipo como text para que PostgREST resuelva el RPC (evita ENUM en la firma expuesta).

DROP FUNCTION IF EXISTS public.aplicar_movimiento(
  public.movimiento_tipo,
  numeric,
  text,
  text,
  text,
  text
);

DROP FUNCTION IF EXISTS public.aplicar_movimiento(
  text,
  numeric,
  text,
  text,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.aplicar_movimiento(
  p_tipo text,
  p_monto numeric,
  p_categoria text,
  p_descripcion text,
  p_origen text,
  p_destino text
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
  new_id uuid;
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
    INSERT INTO public.balances (saldo_disponible, saldo_ahorrado, ultima_actualizacion)
    VALUES (0, 0, now());
  END IF;

  SELECT b.ctid, b.saldo_disponible, b.saldo_ahorrado
  INTO v_ctid, v_saldo_disp, v_saldo_ahor
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

  INSERT INTO public.movimientos (
    tipo,
    monto,
    categoria,
    descripcion,
    origen,
    destino
  )
  VALUES (
    v_tipo,
    p_monto,
    coalesce(nullif(trim(p_categoria), ''), ''),
    coalesce(nullif(trim(p_descripcion), ''), ''),
    nullif(trim(p_origen), ''),
    nullif(trim(p_destino), '')
  )
  RETURNING id INTO new_id;

  IF v_tipo = 'ingreso' THEN
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible + p_monto,
      ultima_actualizacion = now()
    WHERE ctid = v_ctid;
  ELSIF v_tipo = 'gasto' THEN
    UPDATE public.balances
    SET
      saldo_disponible = saldo_disponible - p_monto,
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

  RETURN jsonb_build_object(
    'ok', true,
    'movimiento_id', new_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_movimiento(
  text,
  numeric,
  text,
  text,
  text,
  text
) FROM PUBLIC;

-- Solo service_role: la anon key no debe poder ejecutar lógica que escribe saldos.
GRANT EXECUTE ON FUNCTION public.aplicar_movimiento(
  text,
  numeric,
  text,
  text,
  text,
  text
) TO service_role;

NOTIFY pgrst, 'reload schema';
