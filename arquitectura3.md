# Arquitectura 3 — Grok, UX y mejoras de inteligencia por fases

Este documento define cómo seguir evolucionando el proyecto una vez que ya existe la base funcional.

El objetivo ahora es incorporar Grok de forma controlada, mejorar la experiencia de uso y luego reforzar la inteligencia del sistema sin romper la lógica financiera ni aumentar costos innecesarios.

La regla principal sigue siendo la misma:
**la base de datos manda, el backend valida, y el modelo de lenguaje solo ayuda cuando hace falta**.

---

## Resumen del objetivo

Queremos que el sistema pueda:

* entender texto libre del usuario
* usar Grok como apoyo para interpretar mensajes complejos
* mantener costos bajos
* mejorar la experiencia de chat con detalles simples de UX
* seguir siendo confiable con saldos, ingresos, gastos y ahorros
* dar recomendaciones financieras simples cuando se le pregunte

El sistema debe seguir funcionando incluso si el modelo falla o está desactivado.

---

## Principios obligatorios

1. **La verdad financiera vive en Supabase**

   * Grok no define el saldo.
   * Grok no modifica la base de datos directamente.
   * Grok solo interpreta o ayuda a clasificar.

2. **Primero reglas locales, luego Grok**

   * El parser local debe intentar resolver el mensaje primero.
   * Grok debe actuar solo como respaldo cuando el parser no entienda.

3. **Costos bajos por diseño**

   * Prompts cortos.
   * Contexto mínimo.
   * Respuestas breves.
   * No mandar historial completo.

4. **UX simple y útil**

   * El chat debe sentirse rápido.
   * Debe mostrar estado de carga.
   * Debe ser cómodo de usar en escritorio.

5. **No agregar lógica fuera del plan**

   * Cursor solo debe implementar lo que esté en este documento.
   * No inventar funciones nuevas ni cambiar el orden de fases.

---

# Fase 1 — Integrar Grok como fallback controlado

## Objetivo

Permitir que el sistema use Grok para interpretar mensajes libres cuando el parser local no pueda entenderlos.

Esta fase busca que el chat soporte lenguaje natural más flexible sin perder control ni precisión.

## Cuándo se usa Grok

Solo si ocurre una de estas condiciones:

* el parser local no reconoce la intención
* el texto es ambiguo
* el mensaje mezcla varias acciones y el parser simple no alcanza
* hace falta extraer tipo, monto o categoría con más contexto

## Cuándo no se usa Grok

* cuando el parser local ya entendió el mensaje
* cuando el sistema ya puede registrar el movimiento sin ayuda
* cuando el mensaje es simple y directo
* cuando el LLM está desactivado por configuración

## Qué debe hacer Grok

Grok debe devolver una estructura compacta que permita continuar el flujo normal del sistema.
Ejemplo de resultado esperado:

* tipo: ingreso | gasto | ahorro
* monto
* categoria opcional
* descripcion opcional
* cuenta opcional si corresponde

## Qué no debe hacer Grok

* no debe calcular saldos
* no debe escribir en la base de datos
* no debe responder al usuario como si fuera la verdad final
* no debe decidir por sí solo si un saldo es correcto
* no debe reemplazar la validación del backend

## Reglas de implementación

* usar Grok solo como fallback
* enviar al modelo el contexto mínimo necesario
* evitar prompts largos
* limitar la cantidad de tokens de salida
* validar siempre la respuesta antes de usarla
* si la respuesta no es válida, no tocar la base de datos

## Resultado esperado

El sistema podrá entender frases más libres como:

* “me llegaron 100 lucas”
* “gasté en comida y transporte”
* “guardé plata en el banco”
* “dejé algo para ahorro”

## Criterio de éxito

Grok ayuda cuando hace falta, pero el sistema sigue siendo estable aunque el modelo no responda.

---

# Fase 2 — Mejoras UX rápidas

## Objetivo

Hacer que el chat se sienta más cómodo y profesional sin cambiar la lógica financiera.

## Mejoras incluidas

### 1. Estado “escribiendo…”

Cuando el backend esté procesando, la interfaz debe mostrar un indicador de carga.

Esto ayuda a que el usuario entienda que el sistema está respondiendo.

### 2. Deshabilitar el botón mientras carga

Mientras se espera la respuesta del backend, el botón de enviar debe quedar desactivado.

Esto evita clics repetidos y envíos duplicados.

### 3. Auto scroll

Cada vez que llega un nuevo mensaje, la vista debe bajar automáticamente al último mensaje.

Eso mejora mucho la experiencia de chat.

### 4. Limpiar input al enviar

Después de enviar el mensaje, el campo de texto debe vaciarse automáticamente.

Así el usuario puede escribir el siguiente mensaje sin pasos extra.

## Reglas de esta fase

* no tocar la lógica financiera
* no mover cálculo al frontend
* no meter Grok directamente en la UI
* no añadir complejidad visual innecesaria
* mantener diseño limpio y simple

## Resultado esperado

La interfaz se siente más natural, más rápida y menos frustrante.

## Criterio de éxito

El usuario puede conversar con el sistema sin confusiones visuales ni clics duplicados.

---

# Fase 3 — Mejorar parser e inteligencia local

## Objetivo

Hacer que el sistema entienda mejor las frases comunes antes de depender de Grok.

Esto reduce costo, mejora velocidad y hace que el sistema sea más confiable.

## Qué se debe mejorar

### 1. Parser más robusto

Agregar más patrones para entender lenguaje cotidiano.

Ejemplos:

* “me pagaron”
* “me depositaron”
* “saqué plata”
* “dejé en ahorro”
* “gasté en varias cosas”
* “me fui en uber y comida”

### 2. Mejores categorías

El sistema debe clasificar mejor los gastos o ingresos cuando sea posible.

Ejemplos de categorías simples:

* comida
* transporte
* ocio
* ahorro
* salario
* inversión
* otros

### 3. Interpretación más precisa de montos

Reconocer formas como:

* 100 mil
* 100.000
* cien lucas
* 20k
* 20 lucas

### 4. Recomendaciones financieras simples

Cuando el usuario pregunte, el sistema puede dar sugerencias básicas y prudentes.

Ejemplos:

* qué banco podría ser mejor según el objetivo
* cómo separar ahorro y gasto
* ideas simples para organizar plata

## Reglas de esta fase

* las recomendaciones deben ser simples
* no dar consejos extremos ni riesgosos
* no inventar datos de bancos o inversiones
* si falta información, pedirla o responder de forma prudente
* las recomendaciones no deben alterar saldos ni registros

## Resultado esperado

El parser resuelve más casos por sí solo y Grok queda reservado para los casos realmente difíciles.

## Criterio de éxito

Menos fallos, menos llamadas al modelo y más precisión en uso real.

---

# Fase 4 — Grok pensando mejor

## Objetivo

Hacer que Grok responda mejor, con menos costo y más coherencia.

## Reglas para el comportamiento de Grok

* responder con estructura breve
* evitar texto largo
* no repetir lo que ya sabe el backend
* no recalcular saldos
* no improvisar reglas financieras
* mantenerse dentro de la información que el sistema le entrega

## Qué debe cuidar el prompt de Grok

* instrucciones cortas
* una sola tarea por vez
* formato de salida estricto
* evitar ambigüedad
* no mandar historial entero

## Resultado esperado

Grok entiende mejor al usuario, produce menos ruido y consume menos tokens.

## Criterio de éxito

El modelo aporta valor real sin volverse caro ni difícil de mantener.

---

# Orden obligatorio de implementación

Cursor debe seguir este orden exacto:

1. **Integrar Grok como fallback controlado**
2. **Mejoras UX rápidas**
3. **Mejorar parser e inteligencia local**
4. **Afinar Grok para que piense mejor**

No se debe empezar por la UI avanzada antes de tener Grok bien controlado.
No se debe mejorar el parser sin mantener la lógica actual.
No se debe mover la verdad financiera fuera de Supabase.

---

# Reglas finales

* Si el sistema funciona sin Grok, debe seguir funcionando.
* Si Grok falla, el backend no debe romperse.
* Si el usuario escribe libremente, el sistema debe intentar entender primero localmente y luego con Grok.
* Si una mejora no está en este documento, no se agrega por iniciativa propia.

Este archivo es la guía para la siguiente etapa del proyecto.
