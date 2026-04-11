# Feature — Crear cuenta y agregar dinero siempre disponible

Este documento define cómo permitir que el usuario SIEMPRE tenga la opción de:

* crear una cuenta
* agregar dinero a una cuenta

incluso cuando no existan cuentas previamente en el sistema.

---

## 🎯 Objetivo

Eliminar cualquier bloqueo en la UI que impida al usuario:

* agregar dinero
* crear cuentas nuevas

El sistema debe ser flexible y permitir flujo libre.

---

## 🧠 Problema actual

Actualmente:

* el botón “+ agregar dinero” depende de que exista una cuenta
* si no hay cuenta → no hay acción
* si la tarjeta es sintética → no hay botón

Esto genera:

* fricción
* confusión
* sensación de limitación

---

## ✅ SOLUCIÓN PRINCIPAL

👉 SIEMPRE debe existir una acción global:

[ + Agregar dinero ]
[ + Crear cuenta ]

Independiente del estado del sistema.

---

## 🧩 IMPLEMENTACIÓN

### 1. Botón global (OBLIGATORIO)

Agregar en la UI (parte superior o sidebar):

* botón: “+ Agregar dinero”
* botón: “+ Crear cuenta”

Siempre visibles.

---

## 💰 Flujo — Agregar dinero

### Al presionar “+ Agregar dinero”

Abrir modal con:

* monto
* selector de cuenta (dropdown)
* opción: “crear nueva cuenta”

---

### Caso A — Existen cuentas

* el usuario selecciona una
* se registra ingreso directo a cuenta

---

### Caso B — NO existen cuentas

Mostrar directamente:

* campo nombre cuenta
* banco
* tipo (gasto / ahorro)

Luego:

1. crear cuenta
2. agregar dinero automáticamente

---

## 🏦 Flujo — Crear cuenta

### Modal “Crear cuenta”

Campos:

* nombre cuenta (ej: Cuenta RUT)
* banco (ej: Banco Estado)
* tipo:

  * disponible
  * ahorro

---

### Resultado

* se crea en BD
* aparece en UI
* queda disponible para movimientos

---

## 🔥 REGLA CLAVE

👉 Nunca exigir que exista una cuenta antes de permitir agregar dinero

El sistema debe poder:

* crear cuenta + agregar dinero en el mismo flujo

---

## 🔄 INTEGRACIÓN CON BACKEND

### Caso 1 — cuenta existente

* usar flujo actual de ingreso a cuenta

### Caso 2 — cuenta nueva

* crear cuenta en BD
* luego ejecutar ingreso

Todo en una operación controlada.

---

## 🧠 EXPERIENCIA DE USUARIO

El usuario debe sentir:

* libertad total
* cero bloqueos
* flujo natural

Ejemplo mental:

“quiero meter plata → no me importa si la cuenta existe”

---

## 🎨 DISEÑO (IMPORTANTE)

* modal limpio
* inputs claros
* botón principal destacado
* validaciones simples

---

## 🧪 CASOS DE PRUEBA

### Caso 1

Usuario sin cuentas

✔ puede agregar dinero
✔ crea cuenta automáticamente

---

### Caso 2

Usuario con cuentas

✔ puede elegir cuenta
✔ dinero se asigna correctamente

---

### Caso 3

Usuario crea cuenta manual

✔ aparece en UI
✔ usable inmediatamente

---

## 🚫 PROHIBIDO

* bloquear ingreso por no existir cuenta
* ocultar botones
* depender solo de tarjetas existentes

---

## 🎯 RESULTADO FINAL

El sistema debe:

* permitir crear cuentas en cualquier momento
* permitir agregar dinero siempre
* eliminar fricción
* mejorar experiencia

---

## Orden de implementación

1. agregar botones globales
2. crear modal agregar dinero
3. permitir crear cuenta dentro del flujo
4. conectar con backend
5. actualizar UI

---

## Regla final

Cursor debe asegurar que el usuario siempre tenga una acción disponible para agregar dinero o crear cuentas, sin depender del estado previo del sistema.

---

## 🔒 Regla de no regresión (OBLIGATORIA)

Cualquier cambio implementado en este documento debe cumplir estrictamente:

* NO eliminar funcionalidades existentes
* NO modificar comportamientos que ya funcionan correctamente
* NO romper flujos actuales de ingreso, gasto, ahorro o asignación
* NO duplicar dinero ni alterar balances existentes
* NO cambiar contratos de API sin mantener compatibilidad

### Reglas específicas

1. Mantener intacto el flujo actual de:

   * ingreso a disponible
   * asignación desde disponible
   * gastos y ahorros

2. Si se agrega lógica nueva (crear cuenta + ingreso):

   * debe integrarse sin interferir con el parser actual
   * debe respetar prioridades ya definidas

3. UI:

   * no eliminar botones existentes
   * no ocultar funcionalidades actuales
   * solo agregar nuevas opciones, no reemplazar

4. Backend:

   * no cambiar RPC existentes sin compatibilidad hacia atrás
   * validar que todos los casos actuales sigan funcionando

---

## 🧪 Validación obligatoria

Antes de dar por terminado:

* probar flujos antiguos (chat actual)
* probar nuevos flujos (crear cuenta + agregar dinero)
* verificar que los saldos coinciden
* verificar que no hay duplicación de movimientos

---

## 🎯 Regla final reforzada

El sistema debe evolucionar sin romper lo existente.

👉 Si algo ya funciona, no se toca.
👉 Solo se extiende.
