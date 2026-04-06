-- Limpia todos los datos de la app (finanzas).
-- Ejecutar en Supabase → SQL Editor (o vía psql). Irreversible.
-- Requiere columna saldo_disponible_sin_cuenta en balances (migración 006).

BEGIN;

DELETE FROM public.movimientos;
DELETE FROM public.cuentas;
DELETE FROM public.bancos;
DELETE FROM public.balances;

INSERT INTO public.balances (
  saldo_disponible,
  saldo_ahorrado,
  saldo_disponible_sin_cuenta,
  ultima_actualizacion
)
VALUES (0, 0, 0, now());

COMMIT;
