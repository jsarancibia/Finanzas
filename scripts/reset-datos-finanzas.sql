-- Limpieza total de datos de negocio (movimientos, cuentas, bancos, balances).
-- No elimina funciones RPC ni tipos. Ejecutar en Supabase → SQL Editor si no usas el script Node.

BEGIN;

DELETE FROM public.movimientos;
DELETE FROM public.cuentas;
DELETE FROM public.bancos;
DELETE FROM public.balances;

INSERT INTO public.balances (saldo_disponible, saldo_ahorrado, ultima_actualizacion)
VALUES (0, 0, now());

COMMIT;
