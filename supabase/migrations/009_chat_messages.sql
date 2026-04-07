-- Historial de chat (arquitectura9): solo UX; la verdad financiera sigue en movimientos/balances.

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL DEFAULT 'default',
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  visible boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON public.chat_messages (session_id, created_at ASC);

COMMENT ON TABLE public.chat_messages IS 'Mensajes de chat persistidos para la UI; no afecta saldos.';

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_messages FROM PUBLIC;
GRANT ALL ON public.chat_messages TO service_role;

NOTIFY pgrst, 'reload schema';
