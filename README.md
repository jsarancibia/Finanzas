# Finanzas API

Backend en Node.js + TypeScript para el asistente financiero personal descrito en `arquitectura.md`: chat en lenguaje natural, Supabase como fuente de verdad y LLM solo para interpretación y respuestas.

## Requisitos

- Node.js 20 o superior

## Instalación

```bash
npm install
```

Copia `.env.example` a `.env` y completa las variables.

## Scripts

| Comando        | Descripción                          |
|----------------|--------------------------------------|
| `npm run dev`  | Desarrollo con recarga (`tsx watch`) — solo CLI |
| `npm run dev:web` | Servidor local: UI + `POST /api/chat` (puerto `PORT` o 3000) |
| `npm run build`| Compila a `dist/`                    |
| `npm start`    | Ejecuta `dist/index.js`              |
| `npm run typecheck` | Verifica tipos sin emitir archivos |

## Interfaz (Fase 3, `arquitectura2.md`)

La UI está en `public/index.html`: `GET /api/resumen-cuentas` para el panel de cuentas/ahorros y `POST /api/chat` para el mensaje. El navegador no suma saldos; solo muestra lo que devuelve el backend.

En local, **sin Vercel CLI**:

```bash
npm run build
npm run dev:web
```

Abre **http://localhost:3000** (o el puerto en `PORT` del `.env`). Alternativa: `npx vercel dev` si prefieres emular Vercel.

## Arquitectura 3 (`arquitectura3.md`)

Plan en fases: (1) Grok como fallback — `ENABLE_LLM` y `LLM_*`; (2) UX en `public/index.html`; (3) parser coloquial + categorías + consejos locales; (4) prompt y llamada Grok acotados (`parseMessageLlm.ts`, `llmClient.ts`). La verdad financiera sigue en Supabase.

## Estructura

```
public/         # UI estática (chat)
api/            # Vercel: serverless (p. ej. chat.mjs)
src/
  index.ts      # CLI / comprobaciones
  config/
  routes/       # handleChatPost, etc.
  services/     # Supabase, LLM, dominio
```
