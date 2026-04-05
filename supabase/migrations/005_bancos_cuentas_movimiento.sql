-- arquitectura5: bancos, cuentas por banco, movimientos.cuenta_id, RPC ampliado.

ALTER TYPE public.cuenta_tipo ADD VALUE IF NOT EXISTS 'inversion';

CREATE TABLE IF NOT EXISTS public.bancos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  nombre_normalizado text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bancos_nombre_normalizado_key UNIQUE (nombre_normalizado)
);

CREATE INDEX IF NOT EXISTS bancos_creado_en_idx ON public.bancos (creado_en);

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS banco_id uuid REFERENCES public.bancos (id);

ALTER TABLE public.movimientos
  ADD COLUMN IF NOT EXISTS cuenta_id uuid REFERENCES public.cuentas (id);

CREATE INDEX IF NOT EXISTS movimientos_cuenta_id_idx ON public.movimientos (cuenta_id);

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

REVOKE ALL ON FUNCTION public.aplicar_movimiento(
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.aplicar_movimiento(
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text
) TO service_role;

NOTIFY pgrst, 'reload schema';
