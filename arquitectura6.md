# UI — Tarjetas financieras por secciones (Disponible, Ahorro, Gastos)

Este documento define una mejora de interfaz enfocada en visualizar claramente el dinero del usuario mediante tarjetas bien diseñadas y separadas por tipo.

---

## 🎯 Objetivo

Crear un panel izquierdo tipo dashboard dividido en **3 secciones principales**, todas basadas en tarjetas:

1. Dinero disponible
2. Ahorro
3. Gastos realizados

El usuario debe poder ver de forma rápida:

* cuánto dinero tiene para gastar
* cuánto dinero tiene ahorrado
* en qué está gastando

---

## 🧱 Estructura general

El panel izquierdo se divide en 3 bloques verticales:

### 1. 💳 Dinero disponible

Muestra todas las cuentas donde el usuario tiene dinero para gastar.

#### Ejemplos

* Banco Estado → Cuenta RUT
* Efectivo
* Cuenta corriente

#### Qué debe mostrar cada tarjeta

* nombre de la cuenta
* banco (si aplica)
* monto disponible

#### Reglas

* solo incluir cuentas tipo "disponible"
* no mezclar con ahorro
* cada cuenta es una tarjeta independiente

---

### 2. 🟢 Ahorro

Muestra todas las cuentas donde el usuario guarda dinero.

#### Ejemplos

* Banco Estado → Fondo Mutuo
* Cuenta de ahorro
* Ahorro separado

#### Qué debe mostrar cada tarjeta

* nombre de la cuenta
* banco
* monto ahorrado

#### Reglas

* solo incluir cuentas tipo "ahorro" o "inversión"
* cada cuenta es una tarjeta

---

### 3. 🔴 Gastos

Muestra resumen de gastos realizados.

#### Opciones de visualización (simple primero)

* últimas transacciones
* o total gastado por categoría

#### Qué debe mostrar cada tarjeta

* categoría o descripción
* monto gastado
* (opcional) fecha

#### Reglas

* no mostrar lógica compleja
* mantenerlo simple (últimos gastos o resumen)

---

## 🎨 Diseño de tarjetas (MUY IMPORTANTE)

Las tarjetas actuales deben rediseñarse completamente.

### Estilo requerido

* fondo limpio (blanco o gris suave)
* bordes redondeados (12px–16px)
* sombra suave (no pesada)
* padding amplio
* separación clara entre tarjetas
* tipografía clara

### Jerarquía visual

Dentro de cada tarjeta:

1. Nombre (más pequeño)
2. Banco o tipo (gris suave)
3. Monto (grande y destacado)

### Colores por tipo

* Disponible → azul o neutro
* Ahorro → verde
* Gastos → rojo suave

(No usar colores fuertes ni saturados)

### Ejemplo visual de tarjeta

```
Cuenta RUT
Banco Estado
$120.000
```

---

## 📐 Layout

* panel izquierdo: 30%–35%
* panel derecho (chat): 65%–70%

Dentro del panel izquierdo:

* cada sección tiene título
* debajo se renderizan tarjetas
* scroll vertical si hay muchas

---

## 🔄 Actualización dinámica

Cuando el usuario:

* registra ingreso
* registra gasto
* mueve dinero

El panel debe:

* actualizar tarjetas automáticamente
* reflejar nuevos saldos

---

## ⚠️ Reglas obligatorias

* no calcular nada en frontend
* no duplicar lógica del backend
* no mezclar tipos de dinero
* no inventar datos

---

## 🚀 Resultado esperado

Un dashboard claro donde el usuario vea:

* 💳 su dinero disponible por cuenta
* 🟢 su ahorro separado
* 🔴 en qué está gastando

Todo en tarjetas modernas, limpias y fáciles de leer.

---

## Orden de implementación

1. Crear estructura de 3 secciones
2. Conectar cada sección con backend
3. Renderizar tarjetas por tipo
4. Rediseñar estilos visuales
5. Probar con datos reales

---

## Regla final

Cursor solo debe implementar lo definido en este documento.
No agregar funcionalidades fuera de este alcance.
