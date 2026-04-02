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
| `npm run dev`  | Desarrollo con recarga (`tsx watch`) |
| `npm run build`| Compila a `dist/`                    |
| `npm start`    | Ejecuta `dist/index.js`              |
| `npm run typecheck` | Verifica tipos sin emitir archivos |

## Estructura

```
src/
  index.ts      # Entrada
  config/       # Carga de entorno y constantes
  routes/       # Handlers HTTP (cuando existan)
  services/     # Supabase, LLM, dominio
```

## Próximos pasos

Conexión a Supabase, endpoints o serverless handlers para Vercel, integración del LLM y lectura del JSON de reglas — según el diseño del documento de arquitectura.
