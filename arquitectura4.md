# UI Dashboard — Bancos/Ahorros a la izquierda y Chat a la derecha

Este documento define la siguiente mejora urgente de la interfaz del proyecto.

## Objetivo

Rediseñar la pantalla principal para que quede dividida en dos secciones:

* **Parte izquierda**: tarjetas con los bancos/cuentas que el usuario ha mencionado y cuánto dinero tiene ahorrado en cada una.
* **Parte derecha**: el chat principal del asistente financiero.

La idea es que el usuario vea de forma inmediata dónde tiene su dinero guardado, mientras sigue conversando con el asistente.

---

## Principio principal

La UI **no calcula** saldos, ahorros ni totales.

Todo lo financiero debe venir desde el backend / Supabase.

La interfaz solo debe:

* mostrar datos
* pedir datos al backend
* renderizar respuestas

---

## Distribución de la pantalla

La pantalla debe dividirse en dos columnas:

### 1. Panel izquierdo — Resumen de cuentas

Debe mostrar tarjetas con:

* nombre de la cuenta o banco
* saldo ahorrado
* tipo de cuenta si aplica
* estado visual simple

Ejemplos de tarjetas:

* Banco Estado
* Cuenta de ahorro
* Efectivo
* Ahorro separado
* Inversión

Si no existen cuentas todavía, mostrar un estado vacío simple como:

* “Todavía no tienes ahorros registrados”
* “Registra tu primer ahorro para verlo aquí”

### 2. Panel derecho — Chat

Debe conservar el chat actual:

* mensajes del usuario
* mensajes del asistente
* caja de texto
* botón enviar
* estado de carga

El chat debe seguir funcionando igual, sin romper lo ya construido.

---

## Qué debe mostrar el panel izquierdo

Cada tarjeta debe incluir al menos:

* nombre de la cuenta
* monto ahorrado formateado en moneda local
* indicador visual simple

Opcionalmente puede incluir:

* nota breve
* tipo de cuenta: ahorro / disponible / inversión

---

## Fuente de verdad

Los datos de las tarjetas deben venir desde el backend.

Se debe consultar una ruta que entregue el resumen de cuentas y ahorros del usuario.

La UI no debe:

* sumar montos manualmente
* inferir saldos por su cuenta
* duplicar lógica financiera

---

## Comportamiento esperado

Cuando el usuario registre un ahorro o cambie dinero de una cuenta:

* el chat responde normalmente
* el panel izquierdo se actualiza
* las tarjetas muestran el nuevo estado

La interfaz debe reflejar el estado actual del dinero sin recargar toda la página.

---

## Diseño visual

El estilo debe ser simple, limpio y profesional.

### Recomendaciones visuales

* fondo suave
* tarjetas con bordes redondeados
* separación clara entre paneles
* tipografía legible
* color diferenciado para ahorro y disponible
* layout centrado y cómodo en escritorio

### Estructura sugerida

* panel izquierdo: 30% a 35%
* panel derecho: 65% a 70%

En pantallas pequeñas se puede apilar, pero el foco principal es escritorio.

---

## Reglas de implementación

1. No tocar la lógica financiera.
2. No mover cálculos al frontend.
3. No alterar el funcionamiento del chat.
4. No agregar elementos que no ayuden a ver el resumen de cuentas.
5. Mantener el panel izquierdo simple y claro.

---

## Flujo esperado

1. El frontend carga.
2. Pide el resumen de cuentas al backend.
3. Renderiza las tarjetas de la izquierda.
4. Carga el chat a la derecha.
5. Cuando el usuario envía un mensaje, el chat responde y el resumen se actualiza si cambió el dinero.

---

## Resultado deseado

El usuario verá en una sola pantalla:

* a la izquierda, dónde tiene su dinero ahorrado
* a la derecha, la conversación con el asistente

Esto convierte la interfaz en un dashboard útil y no solo en un chat.

---

## Regla final

Cursor solo debe implementar lo que está definido en este documento.

Si algo no está aquí, no se agrega por iniciativa propia.
