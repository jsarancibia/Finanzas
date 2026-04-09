-- arquitectura11: correo del dueño del mensaje (copia al guardar; autoridad: auth_user_id).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS user_email text;

COMMENT ON COLUMN public.chat_messages.user_email IS 'Correo del usuario autenticado al insertar; auditoría y trazabilidad junto a auth_user_id.';

CREATE INDEX IF NOT EXISTS chat_messages_user_email_lower_idx
  ON public.chat_messages (lower(user_email))
  WHERE user_email IS NOT NULL;

NOTIFY pgrst, 'reload schema';
