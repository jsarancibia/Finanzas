-- Aísla historial de chat por usuario Supabase Auth (no mezclar conversaciones entre cuentas).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE INDEX IF NOT EXISTS chat_messages_auth_user_session_created_idx
  ON public.chat_messages (auth_user_id, session_id, created_at ASC);

COMMENT ON COLUMN public.chat_messages.auth_user_id IS 'auth.users.id; filtrar siempre con session_id para el historial de la pestaña.';

NOTIFY pgrst, 'reload schema';
