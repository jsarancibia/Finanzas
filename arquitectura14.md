Implementar un sistema de AUTO-FALLBACK INTELIGENTE en el flujo de asignación de dinero a cuentas, sin romper la lógica actual ni duplicar saldos.

OBJETIVO:
Permitir que el usuario pueda escribir frases como:
“agrega 1500 a cuenta rut”
aunque no tenga saldo en “disponible sin cuenta”, sin que falle la operación.

---

REGLA PRINCIPAL:

Cuando el usuario intenta asignar dinero a una cuenta (agregar, pasar, mover, dejar, asignar):

1. PRIMERO:
   intentar usar dinero desde “disponible sin cuenta” (flujo actual)

2. SI NO ALCANZA EL SALDO:
   activar AUTO-FALLBACK

---

AUTO-FALLBACK (OBLIGATORIO):

Si no hay suficiente saldo en “disponible sin cuenta”:

- NO lanzar error
- NO bloquear operación
- NO duplicar lógica

En su lugar:

→ crear automáticamente un ingreso por el monto faltante
→ asignarlo directamente a la cuenta destino

---

IMPORTANTE (CRÍTICO):

- El ingreso NO debe ir a “disponible sin cuenta”
- Debe ir DIRECTAMENTE a la cuenta destino
- Debe registrarse como un solo flujo consistente (idealmente en una misma transacción lógica)

---

EJEMPLO:

Usuario:
“agrega 1500 a cuenta rut”

Caso A:
- disponible = 500

Resultado:
- usar 500 desde disponible
- crear ingreso automático de 1000
- total 1500 a cuenta rut

Caso B:
- disponible = 0

Resultado:
- crear ingreso automático de 1500
- asignar a cuenta rut

---

RESPUESTA DEL SISTEMA:

Debe ser clara y honesta:

Ejemplo:
✔ Se agregaron $1.500 a Cuenta RUT
(No había saldo disponible suficiente, se registró como ingreso)

---

PRIORIDAD DE LÓGICA:

1. asignación desde disponible
2. auto-fallback (ingreso automático)
3. nunca tratar esto como ingreso simple separado

---

VALIDACIONES:

- no duplicar dinero
- no ejecutar doble operación
- no romper RPC existente
- mantener consistencia en balances

---

COMPATIBILIDAD:

- no modificar comportamiento cuando sí hay saldo suficiente
- no afectar parser existente
- no romper lógica de ahorro o gasto
- respetar reglas actuales del sistema

---

CASOS A CUBRIR:

- frases naturales chilenas:
  - agrega
  - pasa
  - mete
  - pon
  - deja
  - asigna

- montos en cualquier formato válido

---

PROHIBIDO:

- lanzar error por falta de saldo
- registrar ingreso separado + asignación duplicada
- alterar el saldo disponible incorrectamente
- cambiar lógica existente de ingresos manuales

---

OBJETIVO FINAL:

El sistema debe sentirse flexible y natural:
el usuario escribe libremente y el sistema resuelve sin errores ni fricción, manteniendo consistencia financiera.