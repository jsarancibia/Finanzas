# Arquitectura 2 — Plan de implementación por fases

Este documento define el orden de trabajo del proyecto y debe seguirse **en secuencia**, sin saltar pasos ni mezclar fases.

La regla principal es simple:
**primero API usable**, **después LLM controlado**, **después UI**.

---

## Objetivo general

Construir un asistente financiero personal para uso individual que permita:

* registrar ingresos
* registrar gastos
* registrar ahorros
* separar dinero disponible y dinero ahorrado
* saber dónde está el dinero
* mantener historial confiable
* responder de forma breve y clara
* reducir errores y consumo innecesario de tokens

La fuente de verdad siempre debe ser la base de datos.
El modelo de lenguaje nunca debe ser la fuente de verdad financiera.

---

## Principios del sistema

1. **La base de datos manda**

   * Los montos, saldos y movimientos deben salir de Supabase.
   * El modelo no puede inventar saldos.

2. **Menos texto, menos costo**

   * Las respuestas deben ser cortas.
   * No se debe enviar historial completo al modelo.
   * Solo usar contexto mínimo necesario.

3. **Orden de implementación**

   * Primero API
   * Después LLM controlado
   * Después UI

4. **No inventar funcionalidades**

   * Cursor solo debe implementar lo que diga este archivo.
   * No agregar extras no solicitados.

---

# Fase 1 — API usable (pruebas reales)

## Objetivo

Dejar el sistema listo para probar mensajes reales desde backend, sin interfaz visual todavía.

La API debe permitir enviar un mensaje del usuario y obtener una respuesta del sistema con la lógica ya construida.

## Qué debe hacer esta fase

* Exponer un endpoint o entrada equivalente para recibir un mensaje.
* Procesar el mensaje usando la lógica ya existente.
* Registrar ingresos, gastos y ahorros en la base de datos.
* Actualizar saldos correctamente.
* Responder con un formato corto y claro.
* Manejar errores básicos sin romper el flujo.

## Reglas de esta fase

* No conectar todavía el modelo de lenguaje real.
* No construir la interfaz visual todavía.
* No cambiar la lógica financiera ya validada.
* No recalcular saldos fuera de la base de datos.
* No introducir historial largo en las respuestas.

## Resultado esperado

Al terminar esta fase, el proyecto debe poder recibir pruebas reales como:

* "gané 100000"
* "gasté 20000 en comida"
* "ahorré 30000 en banco estado"

Y devolver respuestas correctas y breves.

## Criterio de éxito

La API funciona sin necesidad de UI y permite validar que todo el core financiero está bien.

---

# Fase 2 — Conectar LLM, pero bien controlado

## Objetivo

Agregar el modelo de lenguaje solo como apoyo, no como núcleo del sistema.

El LLM debe actuar como respaldo cuando el parser por reglas no entienda el mensaje.

## Flujo correcto

1. El usuario escribe un mensaje.
2. El sistema intenta interpretarlo con reglas y parsing local.
3. Si el parsing funciona, se procesa sin LLM.
4. Si el parsing falla, se consulta el LLM.
5. El LLM devuelve solo una estructura útil.
6. El backend valida ese resultado.
7. Luego se guarda y responde usando la lógica normal.

## Qué puede hacer el LLM

* interpretar lenguaje natural complejo
* ayudar a clasificar intención cuando el parser local no alcance
* proponer una estructura de datos para continuar el flujo

## Qué NO puede hacer el LLM

* no puede decidir saldos por sí solo
* no puede escribir directamente en la base de datos
* no puede reemplazar la lógica financiera
* no puede generar respuestas largas
* no puede inventar movimientos

## Reglas de control

* usar el LLM solo cuando sea necesario
* enviar contexto mínimo
* evitar historial completo
* usar respuestas estructuradas y breves
* validar siempre la salida antes de usarla

## Resultado esperado

El sistema debe quedar híbrido:

* rápido y barato con reglas locales
* flexible con LLM solo en casos complejos

## Criterio de éxito

El modelo ayuda, pero nunca manda.
La lógica principal sigue siendo estable y predecible.

---

# Fase 3 — UI (frontend)

## Objetivo

Crear una interfaz visual simple para usar el sistema como chat real.

La UI debe consumir la API ya establecida en las fases anteriores.

## Qué debe hacer esta fase

* mostrar una caja de chat
* permitir enviar mensajes
* mostrar respuestas del asistente
* mostrar saldo o estados básicos si corresponde
* mantener una experiencia limpia y simple

## Reglas de la UI

* no repetir lógica financiera en el frontend
* no calcular saldos en el navegador
* no guardar la verdad financiera en la UI
* solo mostrar datos que vienen desde el backend

## Comportamiento visual esperado

* diseño simple
* estructura clara
* mensajes cortos
* fácil de usar en escritorio
* listo para desplegar en Vercel después

## Resultado esperado

El usuario puede escribir en la interfaz y ver la respuesta del asistente sin depender de consola.

## Criterio de éxito

La experiencia deja de ser solo técnica y pasa a ser una aplicación usable.

---

# Orden obligatorio de trabajo

Cursor debe seguir esta secuencia exacta:

1. **API usable**
2. **LLM controlado**
3. **UI**

No se debe empezar por la UI antes de tener la API funcionando.
No se debe conectar el LLM antes de que la API esté estable.
No se debe reescribir la lógica financiera durante estas fases.

---

## Optimización de costos (obligatorio)

* Minimizar al máximo el uso del LLM (Grok u otro).
* El LLM debe usarse **solo como fallback** cuando el parser local falle.
* Priorizar siempre lógica en **backend** y **base de datos**.
* Mantener **prompts cortos** y **contexto mínimo**.
* No enviar **historial completo** al modelo.
* Mantener **respuestas breves** para reducir consumo de tokens.
* **Optimizar consultas** a la base de datos para evitar cargas innecesarias.
* Evitar consultas **repetidas o redundantes**.
* Mantener la estructura de la base de datos **simple y eficiente**.

---

# Regla final

Este archivo es la guía de implementación de la siguiente etapa del proyecto.

Si algo no está en este documento, no debe añadirse por iniciativa propia.
