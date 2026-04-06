# Fix — Diferenciar ingreso vs asignación (casos reales)

Este documento corrige errores detectados en interacciones reales donde el sistema confunde:

* ingreso nuevo
* asignación desde dinero existente

---

## 🎯 Problema detectado

Ejemplo real:

"del dinero para asignar tengo 9.695 en mercado pago para gastar"

Resultado actual:

* ✔ Ingreso registrado: $9.695
* ❌ ERROR: se creó dinero nuevo

---

## 🧠 Qué debería pasar

Esa frase NO es ingreso.

Es:

* uso de dinero existente
* asignación desde "pendiente de repartir"

---

## 🔍 Regla clave

Si el mensaje contiene:

* "dinero para asignar"
* "dinero disponible"
* "para asignar"
* "pendiente"

👉 NUNCA es ingreso

---

## 🧩 Clasificación correcta

Frase:
"del dinero para asignar tengo 9.695 en mercado pago para gastar"

Debe interpretarse como:

* tipo: asignación
* origen: pendiente de repartir
* destino: mercado pago
* monto: 9695

---

## ❌ Qué está mal hoy

El sistema detecta:

* "tengo"

Y lo clasifica como ingreso automáticamente.

---

## ✅ Solución

### 1. Prioridad de reglas

Antes de detectar ingreso por "tengo":

👉 validar si hay contexto de dinero existente

Orden correcto:

1. asignación desde disponible
2. ahorro
3. gasto
4. ingreso

---

### 2. Regla anti-ingreso

Si el mensaje contiene alguna de estas frases:

* "del dinero"
* "del disponible"
* "para asignar"
* "pendiente"

👉 bloquear interpretación como ingreso

---

### 3. Ajuste en parser

Caso especial:

"tengo X en Y para gastar"

Reglas:

* si NO hay contexto → ingreso
* si hay contexto de disponible → asignación

---

## 🧠 Ejemplos corregidos

### Caso 1

"tengo 20.320"

✔ ingreso

---

### Caso 2

"tengo 9.695 en mercado pago para gastar"

✔ ingreso (si no hay contexto previo)

---

### Caso 3

"del dinero para asignar tengo 9.695 en mercado pago"

✔ asignación (NO ingreso)

---

### Caso 4

"del disponible deja 50.000 en cuenta rut"

✔ asignación

---

## 🛠️ Cambios necesarios

### Parser

* agregar detección de contexto previo (keywords)
* bloquear ingreso si hay contexto de origen

### Flujo

* insertar validación antes del parser de ingreso

---

## 📊 Resultado esperado

* no se crean ingresos falsos
* no se infla el saldo
* el dinero se mueve correctamente

---

## 🧪 Test obligatorio

"del dinero para asignar tengo 9.695 en mercado pago para gastar"

Resultado esperado:

* NO ingreso
* asignación
* saldo total igual

---

## 🚫 Prohibido

* no usar "tengo" como trigger único de ingreso
* no ignorar contexto de origen

---

## 🎯 Conclusión

El sistema debe entender contexto, no solo palabras.

"tengo" ≠ siempre ingreso.

---

## Regla final

Si hay indicio de dinero existente → nunca crear dinero nuevo.
