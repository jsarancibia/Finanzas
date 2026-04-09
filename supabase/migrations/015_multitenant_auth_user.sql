-- Aísla datos financieros por usuario Supabase Auth (balances, bancos, cuentas, movimientos).

-- balances: id estable para updates por usuario
ALTER TABLE public.balances
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE public.balances SET id = gen_random_uuid() WHERE id IS NULL;

-- Igual que 007: una sola fila canónica antes de amarrar usuarios (evita varias filas al mismo auth_user_id).
DO $$
DECLARE
  n int;
  sd numeric;
  sa numeric;
  sc numeric;
  ua timestamptz;
BEGIN
  SELECT count(*)::int INTO n FROM public.balances;
  IF n > 1 THEN
    SELECT
      COALESCE(SUM(saldo_disponible), 0),
      COALESCE(SUM(saldo_ahorrado), 0),
      COALESCE(SUM(saldo_disponible_sin_cuenta), 0),
      COALESCE(MAX(ultima_actualizacion), now())
    INTO sd, sa, sc, ua
    FROM public.balances;
    DELETE FROM public.balances;
    INSERT INTO public.balances (saldo_disponible, saldo_ahorrado, saldo_disponible_sin_cuenta, ultima_actualizacion, id)
    VALUES (sd, sa, sc, ua, gen_random_uuid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'balances_pkey'
  ) THEN
    ALTER TABLE public.balances ADD PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE public.balances
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.bancos
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.movimientos
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Un banco por nombre normalizado por usuario (antes era global).
ALTER TABLE public.bancos DROP CONSTRAINT IF EXISTS bancos_nombre_normalizado_key;

CREATE UNIQUE INDEX IF NOT EXISTS bancos_auth_user_nombre_norm_uidx
  ON public.bancos (auth_user_id, nombre_normalizado);

-- Una fila de balances por usuario autenticado
CREATE UNIQUE INDEX IF NOT EXISTS balances_one_per_auth_user_uidx
  ON public.balances (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Datos existentes (instalación mono-usuario): primer usuario de Auth
DO $$
DECLARE
  u uuid;
BEGIN
  SELECT id INTO u FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF u IS NULL THEN
    RAISE NOTICE '015_multitenant: sin filas en auth.users; asigna auth_user_id manualmente.';
  ELSE
    UPDATE public.balances SET auth_user_id = u WHERE auth_user_id IS NULL;
    UPDATE public.bancos SET auth_user_id = u WHERE auth_user_id IS NULL;
    UPDATE public.cuentas SET auth_user_id = u WHERE auth_user_id IS NULL;
    UPDATE public.movimientos SET auth_user_id = u WHERE auth_user_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS movimientos_auth_user_fecha_idx
  ON public.movimientos (auth_user_id, fecha DESC);

CREATE INDEX IF NOT EXISTS cuentas_auth_user_idx
  ON public.cuentas (auth_user_id);

NOTIFY pgrst, 'reload schema';
