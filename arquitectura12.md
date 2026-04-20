Extiende el sistema financiero actual para soportar 3 formas correctas de ingreso de dinero, sin romper la lógica existente ni generar duplicación de saldos.

OBJETIVO:
Permitir:
1) ingreso a dinero disponible (repartir)
2) ingreso directo a una cuenta
3) ingreso manual desde UI a cuentas

---

REGLAS GENERALES (OBLIGATORIAS):

- Nunca duplicar dinero
- Nunca mezclar ingreso con asignación
- Mantener consistencia en balances
- Toda operación debe pasar por la lógica central (RPC / transacción)
- No modificar el comportamiento existente si ya es correcto

---

CASO 1 — INGRESO A DINERO A REPARTIR (actual)

Ejemplo:
“tengo 100000”

Comportamiento:
- tipo: ingreso
- destino: disponible (sin cuenta)
- aumenta saldo disponible
- no afecta cuentas directamente

---

CASO 2 — INGRESO DIRECTO A CUENTA (nuevo)

Ejemplo:
“tengo 100000 en cuenta rut”
“me pagaron 50.000 en mercado pago”
“recibí 20000 en banco estado”

Comportamiento:
- tipo: ingreso
- destino: cuenta específica
- NO pasar por “dinero a repartir”
- aumenta directamente el saldo de la cuenta
- no modificar el disponible global

IMPORTANTE:
- detectar cuenta (banco + producto)
- usar misma lógica de cuentas existente
- no duplicar en disponible

---

CASO 3 — INGRESO MANUAL DESDE UI (nuevo)

Flujo:
- el usuario puede presionar “+ agregar dinero” en una tarjeta de cuenta

Comportamiento:
- enviar request al backend con:
  - monto
  - cuenta destino
- backend registra:
  - tipo: ingreso
  - destino: cuenta específica
- actualizar saldo de la cuenta
- no pasar por disponible

---

PRIORIDAD DE PARSEO (CRÍTICO):

Orden correcto:

1. ingreso directo a cuenta (si hay cuenta explícita)
2. asignación desde disponible (agrega, pasa, mueve, etc.)
3. ingreso general (tengo, recibí, gané sin cuenta)

Esto evita errores como:
- interpretar “tengo 100000 en cuenta rut” como disponible
- interpretar “agrega 10000 a cuenta rut” como ingreso

---

VALIDACIONES:

- si hay cuenta en el mensaje → nunca usar flujo de disponible
- si es “agregar/pasar/mover” → usar disponible, no ingreso
- si es ingreso → siempre crear dinero nuevo (salvo reglas de asignación)

---

RESPUESTAS DEL SISTEMA:

Ejemplo ingreso disponible:
✔ Ingreso registrado: $100.000
Saldo disponible: $100.000

Ejemplo ingreso directo a cuenta:
✔ Ingreso registrado: $100.000 (Cuenta RUT)
Saldo cuenta actualizado

---

COMPATIBILIDAD:

- mantener compatibilidad con parser flexible
- mantener soporte de términos chilenos
- no romper sistema de ahorro ni gasto

---

OBJETIVO FINAL:

El sistema debe distinguir correctamente entre:
- dinero nuevo
- dinero a repartir
- dinero asignado a cuentas

Y permitir flujos más naturales sin pasos innecesarios.