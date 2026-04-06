# Corrección de asignación desde dinero disponible

Este documento define el arreglo para un problema específico del sistema:

Cuando el usuario dice frases como:

* "del dinero disponible deja 130.000 en mercado libre para gastar"
* "deja dinero disponible 120.000 en cuenta rut para gastar"
* "del disponible pasa 50.000 a efectivo"
* "de los 300.000 asigna 100.000 a cuenta rut"

el sistema **no debe crear dinero nuevo**.

Debe usar el dinero que ya existe en la bolsa de disponible / pendiente de repartir y moverlo hacia la cuenta o destino correcto.

---

## 🎯 Objetivo

Corregir el comportamiento del sistema para que las frases de asignación o reparto se interpreten como:

* mover dinero existente
* asignar dinero disponible a una cuenta
* reducir el pendiente de repartir
* aumentar el saldo de la cuenta destino

No debe interpretarse como ingreso nuevo.

---

## 🧠 Problema actual

El sistema está haciendo esto mal:

* el usuario escribe una frase de asignación
* el parser la interpreta como ingreso
* el RPC suma dinero a la cuenta destino
* el saldo total se infla

### Ejemplo incorrecto

Entrada:

* "del dinero disponible deja 130.000 en mercado libre para gastar"

Resultado incorrecto actual:

* se registra como ingreso de $130.000
* el saldo disponible sube
* el dinero se duplica visualmente

### Resultado correcto esperado

* se toma dinero desde la bolsa disponible o pendiente de repartir
* se asigna a la cuenta destino
* no aumenta el total general
* solo cambia la distribución interna del dinero

---

## 🧩 Nuevo concepto funcional

Se debe tratar este caso como una operación de:

* **asignación desde disponible**
* **transferencia interna**
* **reparto de dinero existente**

No como ingreso.

---

## ✅ Regla principal

Si la frase contiene una referencia al origen como:

* dinero disponible
* disponible
* del disponible
* de los X
* de ese dinero
* del pendiente
* de lo que tengo para repartir

entonces el sistema debe interpretar la acción como una **asignación desde saldo existente**.

---

## 🧠 Nuevos tipos de operación

Agregar un tipo lógico para este caso:

* `asignar_desde_disponible`
* `reasignar`
* `transferencia_interna`

La implementación puede usar uno solo, pero debe distinguirse claramente de:

* ingreso
* gasto
* ahorro

---

## 🔄 Flujo correcto

1. Llega el mensaje del usuario.
2. El sistema detecta si es una asignación desde disponible.
3. Si lo es, identifica:

   * monto a mover
   * cuenta o destino
   * origen = disponible / pendiente de repartir
4. El backend descuenta ese monto del disponible pendiente.
5. El backend suma ese monto a la cuenta destino.
6. El total general no aumenta.
7. El asistente responde con una confirmación breve.

---

## 🗄️ Reglas de saldo

### Lo que debe pasar

* baja el dinero pendiente/disponible sin cuenta
* sube el saldo de la cuenta destino
* no se crea dinero nuevo

### Lo que no debe pasar

* no sumar como ingreso
* no inflar el saldo total
* no duplicar dinero entre disponible y cuenta destino

---

## 📌 Ejemplos que deben funcionar

### Ejemplo 1

Entrada:

* "del dinero disponible deja 130.000 en mercado libre para gastar"

Interpretación correcta:

* origen: disponible / pendiente de repartir
* destino: mercado libre
* monto: 130000
* tipo: asignación

### Ejemplo 2

Entrada:

* "deja dinero disponible 120.000 en cuenta rut para gastar"

Interpretación correcta:

* origen: disponible / pendiente de repartir
* destino: cuenta rut
* monto: 120000
* tipo: asignación

### Ejemplo 3

Entrada:

* "de los 300.000 asigna 100.000 a cuenta rut"

Interpretación correcta:

* origen: disponible / pendiente de repartir
* destino: cuenta rut
* monto: 100000
* tipo: asignación

### Ejemplo 4

Entrada:

* "pasa 50 lucas del disponible a efectivo"

Interpretación correcta:

* origen: disponible / pendiente de repartir
* destino: efectivo
* monto: 50000
* tipo: asignación

---

## 🔍 Reglas de detección del parser

El parser debe considerar como señales de asignación frases como:

* deja
* dejá
* dejar
* dejé
* asigna
* asignar
* pasa
* pasar
* mueve
* mover
* traspasa
* traspasar
* reparte
* repartir
* separa
* separar
* aparta
* apartar

### Señales de origen disponible

* dinero disponible
* disponible
* del disponible
* de los
* del dinero
* pendiente de repartir
* para repartir
* para gastar

### Señales de destino

* en cuenta rut
* en mercado libre
* en efectivo
* en fondo mutuo
* en ahorro

---

## 🧠 Prioridad de interpretación

Si el mensaje contiene:

* un verbo de asignación
* un origen de dinero disponible
* una cuenta o destino claro

entonces debe ir por la ruta de asignación interna.

No debe ir al parser de ingreso.
No debe ir al flujo de ahorro normal.

---

## 🛠️ Cambios necesarios en el backend

### 1. Nuevo tipo de operación

Agregar un caso específico en el parser y en el flujo principal.

### 2. RPC o función SQL nueva o ampliada

Debe existir una operación que haga algo equivalente a:

* restar del disponible/pending
* sumar a la cuenta destino
* registrar el movimiento como asignación interna

### 3. Respuesta clara

Ejemplo de respuesta:

* "✔ Asignado $130.000 a Mercado Libre"
* "Saldo disponible ajustado"
* "Saldo de la cuenta actualizado"

---

## 📊 Reglas de UI

La interfaz debe reflejar correctamente:

* dinero disponible sin cuenta
* dinero ya asignado a cuentas
* no duplicar montos visualmente

Si el usuario asigna dinero a una cuenta, el panel izquierdo debe mostrar:

* baja en disponible/pending
* subida en la cuenta destino

---

## 🚫 Prohibido

* no tratar esto como ingreso
* no crear dinero nuevo
* no recalcular manualmente en frontend
* no mover dinero sin validar origen y destino
* no perder el historial de asignaciones

---

## 🧪 Casos de prueba mínimos

### Caso A

"deja dinero disponible 120.000 en cuenta rut para gastar"

Esperado:

* no ingreso
* asignación desde disponible
* saldo total intacto

### Caso B

"del disponible pasa 50.000 a efectivo"

Esperado:

* transferencia interna
* baja disponible
* sube efectivo

### Caso C

"de los 300.000 asigna 100.000 a fondo mutuo"

Esperado:

* asignación desde dinero ya existente
* no duplicación

---

## 🎯 Resultado esperado

Con este cambio, el sistema podrá distinguir entre:

* recibir dinero nuevo
* mover dinero ya existente
* ahorrar dinero
* gastar dinero

Y dejará de inflar saldos por error.

---

## Orden de implementación

1. Detectar frases de asignación desde disponible.
2. Crear tipo de operación específico.
3. Ajustar backend y RPC.
4. Ajustar UI para reflejar el movimiento.
5. Probar con frases reales del usuario.

### Estado en código (referencia)

- Parser ampliado y orden de ejecución: `parseMessageDisponibleSinCuenta.ts`, `processMessage.ts` (asignación antes del regex de ingresos).
- RPC existente: `asignar_desde_disponible_sin_cuenta` (no crea dinero nuevo en el total).
- Destinos: «mercado libre» y «efectivo» en `mapExtremoTraspaso` (`parseMessageTraspaso.ts`).
