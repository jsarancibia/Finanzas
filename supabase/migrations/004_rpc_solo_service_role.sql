-- Si ya aplicaste 002 con GRANT a anon/authenticated, revoca y deja solo service_role.

REVOKE EXECUTE ON FUNCTION public.aplicar_movimiento(
  text,
  numeric,
  text,
  text,
  text,
  text
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.aplicar_movimiento(
  text,
  numeric,
  text,
  text,
  text,
  text
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.aplicar_movimiento(
  text,
  numeric,
  text,
  text,
  text,
  text
) TO service_role;

NOTIFY pgrst, 'reload schema';
