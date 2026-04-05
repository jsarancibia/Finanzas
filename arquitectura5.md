# Arreglo de mensajes largos y soporte para múltiples cuentas por banco

Este documento define la corrección necesaria para dos problemas del sistema:

1. El parser no reconoce mensajes largos o con más contexto.
2. El modelo de cuentas debe soportar varios productos dentro del mismo banco.

La regla principal sigue siendo la misma:
**la base de datos manda, el backend valida, y el asistente solo interpreta**.

---

## Problema 1 — Mensajes largos no reconocidos

### Ejemplo actual que falla

* "tengo ahorrado 50.000 en banco estado fondo mutuo"

El sistema debe reconocer ese mensaje aunque tenga más texto, en vez de responder:

* "No reconocí el mensaje"

### Qué debe pasar

El parser debe ser más tolerante y extraer la intención aunque el texto venga acompañado de más contexto.

Debe identificar, como mínimo:

* tipo de movimiento o estado
* monto
* banco o institución
* producto o subcuenta
* si corresponde, si es ahorro o dinero disponible

### Regla de interpretación

El sistema debe intentar entender la frase completa aunque el usuario escriba:

* texto adicional
* orden distinto
* palabras mezcladas
* detalles después del monto

No debe exigir una estructura rígida.

### Ejemplos que debe aceptar

* "tengo ahorrado 50.000 en banco estado fondo mutuo"
* "guardé 30 lucas en banco estado cuenta rut"
* "dejé 100000 en fondo mutuo banco estado"
* "tengo 80 mil para gastar en cuenta rut"
* "pasé 20.000 a ahorro en banco estado"

---

## Problema 2 — Un mismo banco puede tener varias cuentas o productos

### Ejemplo real

El usuario puede tener dentro de un mismo banco varias cuentas distintas:

* Banco Estado

  * Cuenta RUT
  * Fondo Mutuo
  * Cuenta de ahorro

Esto debe estar soportado de forma natural.

### Qué debe permitir el sistema

Debe poder registrar:

* un banco principal
* varias cuentas o productos dentro de ese banco
* saldo independiente por cada cuenta
* tipo de cuenta: ahorro / disponible / inversión

### Regla importante

No se debe asumir que un banco equivale a una sola cuenta.

Un banco puede tener varias subcuentas o productos financieros.

---

## Estructura de datos recomendada

### 1. bancos

Representa el banco o institución principal.

Campos sugeridos:

* id
* nombre
* alias opcionales
* creado_en

Ejemplos:

* Banco Estado
* BCI
* Santander
* Banco de Chile

### 2. cuentas

Representa cada cuenta, producto o bolsillo financiero dentro de un banco.

Campos sugeridos:

* id
* banco_id
* nombre
* tipo
* saldo
* activo
* creado_en

Ejemplos:

* Banco Estado → Cuenta RUT → disponible
* Banco Estado → Fondo Mutuo → ahorro o inversión
* Banco Estado → Cuenta de Ahorro → ahorro

### 3. movimientos

Cada movimiento debe poder asociarse a una cuenta específica.

Campos sugeridos:

* id
* tipo
* monto
* descripcion
* banco_id opcional
* cuenta_id opcional
* cuenta_origen opcional
* cuenta_destino opcional
* fecha

---

## Reglas de parsing nuevas

### 1. Búsqueda flexible de intención

El parser debe buscar palabras clave en cualquier parte del texto, no solo al inicio.

Ejemplos:

* "tengo ahorrado"
* "ahorrado"
* "guardé"
* "dejé"
* "saqué"
* "gasté"
* "me depositaron"
* "me pagaron"

### 2. Monto en cualquier posición

El monto puede aparecer:

* al inicio
* en el medio
* al final

El parser debe detectarlo sin exigir formato exacto.

### 3. Banco y cuenta por contexto

Si el mensaje menciona:

* banco
* banco estado
* cuenta rut
* fondo mutuo
* ahorro
* inversión

el sistema debe intentar asociar el movimiento a esa cuenta o producto.

### 4. Descripción libre

Todo lo que no sea monto, tipo o cuenta debe poder quedar como descripción.

Así el sistema no pierde contexto útil.

---

## Casos que deben funcionar

### Caso A

Entrada:

* "tengo ahorrado 50.000 en banco estado fondo mutuo"

Interpretación esperada:

* tipo: ahorro
* monto: 50000
* banco: Banco Estado
* cuenta: Fondo Mutuo
* destino: ahorro o inversión

### Caso B

Entrada:

* "me pagaron 100 mil en banco estado cuenta rut"

Interpretación esperada:

* tipo: ingreso
* monto: 100000
* banco: Banco Estado
* cuenta: Cuenta RUT
* destino: disponible

### Caso C

Entrada:

* "gasté 20000 desde cuenta rut en comida"

Interpretación esperada:

* tipo: gasto
* monto: 20000
* banco: Banco Estado u otro banco inferido si ya existe contexto
* cuenta: Cuenta RUT
* categoría: comida

---

## Reglas para múltiples cuentas del mismo banco

### 1. No reemplazar una cuenta por otra

Si ya existe:

* Banco Estado → Cuenta RUT
* Banco Estado → Fondo Mutuo

el sistema debe conservar ambas por separado.

### 2. El nombre de la cuenta importa

La cuenta debe poder distinguirse por nombre exacto o alias.

Ejemplos:

* Cuenta RUT
* Fondo Mutuo
* Ahorro Banco Estado

### 3. El tipo ayuda a clasificar

Cada cuenta debe tener un tipo lógico:

* disponible
* ahorro
* inversión

### 4. Un banco puede tener varias cuentas activas

No hay límite de cuentas por banco.

---

## Cómo debe comportarse el backend

### Flujo nuevo esperado

1. Llega el mensaje del usuario.
2. El parser intenta entender intención, monto, banco y cuenta.
3. Si existe un banco/cuenta conocida, se reutiliza.
4. Si no existe, se crea o se pide confirmación según el caso.
5. El movimiento se registra en la cuenta correcta.
6. El saldo correspondiente se actualiza.
7. Se responde con un mensaje corto y claro.

---

## Qué hacer cuando falte información

Si el usuario dice algo ambiguo como:

* "tengo ahorrado 50.000"

pero no especifica dónde está ese dinero, el sistema debe:

* guardar el monto si el diseño lo permite
* o pedir la cuenta/banco si es necesario para no perder precisión

La regla debe ser:

**no inventar cuentas si el texto no las menciona y no hay contexto suficiente**.

---

## Mejoras requeridas en el parser

### 1. Soporte de texto largo

El parser debe leer todo el mensaje y no detenerse por texto extra.

### 2. Soporte de expresiones más flexibles

Debe entender variantes como:

* "ahorrado"
* "ahorro"
* "guardar"
* "guardé"
* "dejé"
* "aparté"
* "invertí"

### 3. Soporte de múltiples entidades

Debe poder reconocer en la misma frase:

* un banco
* una cuenta
* un monto
* una intención
* una categoría

### 4. Prioridad del contexto

Si el usuario ya habló antes de un banco o cuenta, el sistema puede usar ese contexto, pero sin sobreescribirlo si el mensaje menciona otro producto distinto.

---

## Reglas de diseño de UI relacionadas

La interfaz de la izquierda debe poder mostrar:

* banco principal
* cuentas del banco
* saldo de cada cuenta

Ejemplo:

* Banco Estado

  * Cuenta RUT: $120.000
  * Fondo Mutuo: $50.000

Esto permite visualizar varias cuentas del mismo banco sin mezclar saldos.

---

## Reglas finales

* No tratar un banco como una sola cuenta.
* No rechazar mensajes largos solo por tener texto extra.
* No exigir frases rígidas al usuario.
* No perder contexto útil.
* No inventar saldo ni cuentas.
* No cambiar la lógica financiera central.

---

## Orden de implementación sugerido

1. Mejorar parser para mensajes largos.
2. Agregar soporte real para banco + múltiples cuentas.
3. Ajustar backend para asociar movimientos a cuenta correcta.
4. Actualizar la UI de resumen para mostrar varias cuentas por banco.
5. Probar con frases reales del usuario.

---

## Criterio de éxito

El sistema debe reconocer frases largas como esta sin fallar:

* "tengo ahorrado 50.000 en banco estado fondo mutuo"

Y además debe permitir que un mismo banco tenga varias cuentas separadas, cada una con su propio saldo y propósito.

---

## Regla final para Cursor

Cursor solo debe implementar lo que está definido en este documento.

Si algo no está aquí, no debe agregarse por iniciativa propia.
