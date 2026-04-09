# Finanzas API

Backend en Node.js + TypeScript para el asistente financiero personal descrito en `arquitectura.md`: chat en lenguaje natural, Supabase como fuente de verdad y LLM solo para interpretación y respuestas.

## Requisitos

- Node.js 20 o superior

## Instalación

```bash
npm install
```

Copia `.env.example` a `.env` y completa las variables. Para pruebas E2E en local, copia `.env.e2e.example` a `.env.e2e` (está en `.gitignore`).

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo con recarga (`tsx watch`) — solo CLI |
| `npm run dev:web` | Servidor local: UI + APIs (puerto `PORT` o 3000); requiere `npm run build` antes |
| `npm run build` | Compila a `dist/` |
| `npm start` | Ejecuta `dist/index.js` |
| `npm run typecheck` | Verifica tipos (`tsc --noEmit`) |
| `npm run check:parsers` | Comprueba parsers críticos (repartir vs ingreso, typos de banco) |
| `npm run test:e2e` | Playwright: login → panel → chat → resumen (omitido si faltan `E2E_*`; carga `.env.e2e` si existe) |
| `npm run test:e2e:ui` | Misma suite con interfaz de Playwright |

## CI (GitHub Actions)

En cada push o PR a `main` / `master`, el workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) ejecuta:

1. `npm ci` → `npm run typecheck` → `npm run check:parsers`

Job opcional **E2E** (solo si configuras en el repo **Settings → Secrets and variables → Actions**):

- **Variable** `E2E_BASE_URL`: URL pública de la app (p. ej. `https://tu-app.vercel.app`).
- **Secrets** `E2E_USER_EMAIL` y `E2E_USER_PASSWORD`: usuario válido en Supabase Auth.

Si `E2E_BASE_URL` está vacía, el job E2E no se ejecuta (no falla el pipeline). Con la variable definida, los secrets deben coincidir con un usuario real; si usas `ALLOWED_AUTH_EMAIL` en el servidor, el correo E2E debe ser el permitido.

Tras un fallo E2E, el workflow intenta subir artefactos `test-results/` y `playwright-report/`.

## Pruebas E2E (Playwright)

- Archivos en `e2e/`; configuración en `playwright.config.ts` (carga opcional `.env.e2e` vía `dotenv`).
- **Contra despliegue:** define `E2E_BASE_URL`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` y ejecuta `npm run test:e2e`.
- **Contra local:** en una terminal `npm run build && npm run dev:web`; en otra, `.env.e2e` con `E2E_BASE_URL=http://localhost:3000` y credenciales, luego `npm run test:e2e`.

El escenario automático cubre ingreso coloquial y visibilidad del resumen. El reparto desde colchón («del dinero a repartir…») depende del saldo en BD; conviene validarlo una vez a mano tras desplegar (ver checklist siguiente).

## Checklist antes de publicar

1. **Vercel (u otro host):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; opcional `ALLOWED_AUTH_EMAIL`, `LLM_*` si usas LLM.
2. **Supabase:** aplicar migraciones en orden (`supabase/migrations/`), incluida `017_asignar_sin_cuenta_cuenta_existente.sql` si aún no está en producción.
3. **Tras el deploy:** iniciar sesión, enviar un mensaje de ingreso, uno de reparto («del dinero a repartir… en cuenta X») si aplica, y comprobar que el panel de totales se actualiza.
4. **GitHub (opcional):** variable `E2E_BASE_URL` + secrets de usuario para que el job E2E valide la URL real en cada push.

## Interfaz (Fase 3, `arquitectura2.md`)

La UI está en `public/index.html` (con `auth-shell.js` + `finanzas-app.js`): login con **Supabase Auth** (correo + contraseña), sesión persistente en el navegador y **Cerrar sesión**. Sin sesión válida no se muestra el panel ni se cargan datos financieros.

Endpoints protegidos con `Authorization: Bearer <access_token>`: `POST /api/chat`, `GET /api/resumen-cuentas`, `GET /api/chat-history`, `POST /api/chat-clear`, `GET /api/auth-session`. Público solo `GET /api/auth-config` (URL + anon key para inicializar el cliente en el front).

Opcional en `.env`: `ALLOWED_AUTH_EMAIL` — si está definido, solo ese correo puede usar la API tras autenticarse. Crea el usuario en Supabase → Authentication → Users (sin registro público).

El navegador no suma saldos; solo muestra lo que devuelve el backend.

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
.github/workflows/  # CI (typecheck, parsers, E2E opcional)
e2e/                  # Playwright: flujo login + chat + resumen
public/               # UI (index + login + módulos ES)
scripts/              # dev-web, prelaunch-check, migraciones
lib/                  # authGuard.mjs (compartido por handlers Vercel)
api/                  # Vercel: serverless (p. ej. chat.mjs)
src/
  index.ts            # CLI / comprobaciones
  config/
  routes/             # handleChatPost, etc.
  services/           # Supabase, LLM, dominio
playwright.config.ts
```
